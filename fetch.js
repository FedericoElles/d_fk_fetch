var cheerio = require('cheerio');
var request = require('request');
var fs = require('fs');
var Q = require('q');




/*
* Fetch data for URL
*/
function fetchURL(id){
  var deferred = Q.defer();
  var url = 'http://www.duesseldorf.de/cgi-bin/familienkarte/familienkarte.pl?detail=2&id='+id;
  request(url, function(error, response, html){
    if(!error){
      var $ = cheerio.load(html);

      //console.log('html', $('div[class=midLeft1]').html())
      var attr, val;
      var json = {
        id:id,
        filialen:[],
        dateFetched: new Date()
      };
      var pointer = -1;
      var success = false;
      $('div[class=midLeft1] tr').each(function(i, elem) {
        success = true;
        attr = $(this).children().first().text();
        val = $(this).children().last().text()

        if (attr === 'Filiale'){
          pointer+=1;
          json.filialen[pointer] = {};
        }

        if (pointer < 0){
          json[attr] = val;
        } else {
          json.filialen[pointer][attr] = val;
        }

      });
      if (success && json['Ort']){
        deferred.resolve(json);
      } else {
        deferred.reject({
        status:'Error', 
        reason: 'ID ' + id + ' seems not available'
      })
      }

    } else {
      deferred.reject({
        status:'Error', 
        reason: 'Could not fetch URL with ID: ' + id, 
        error: error
      });
    }
  });

  return deferred.promise;  

}

/*
 * Write file to FS
 */
function writeFile(id, json){
  var text = JSON.stringify(json, null, 2);
  console.log(text);
  fs.writeFile('data/'+id+'.json', text, function (err) {
    if (err) return console.log(err);
    console.log('File written');
  });
}


function geoCodeAddress(id, address){
  var deferred = Q.defer();
  var url = 'http://maps.googleapis.com/maps/api/geocode/json?address='+address;

  request(url, function(error, response, html){
    if(!error){
      var json = JSON.parse(html);

      if (json.results.length > 0){
        deferred.resolve({
          status:'OK',
          id: id,
          coordinates: json.results[0].geometry.location
        });
      } else {
        deferred.reject({
          status:'Error', 
          reason: 'Could not geocode address: ' + address, 
          error: error
        });
      }


    } else {
      deferred.reject({
        status:'Error', 
        reason: 'Could not fetch Google geocode URL: ' + url, 
        error: error
      });
    }
  });

  return deferred.promise;  
}


/**
 * Geocoding all available adresses
 */
function geoCodeAddresses(json){
  var deferred = Q.defer();

  var promises = [];
  if (json['Straße'] && json['Ort']){
    promises.push(geoCodeAddress(0, json['Straße'] + ',' + json['Ort']));
  }
  for (var i = 0, ii = json.filialen.length; i<ii; i+=1) {
    var filiale = json.filialen[i];
    if (filiale['Straße'] && filiale['Ort']){
      promises.push(geoCodeAddress(i+1, filiale['Straße'] + ',' + filiale['Ort']));
    }
  };

  Q.allSettled(promises).then(function(data){
    //console.log('coordinates available', data);
    if (data.length){
      for (var i=0, ii= data.length;i<ii;i+=1){
        if (data[i].state === 'fulfilled'){
          var result = data[i].value;
          if (result.status === 'OK'){
            if (result.id === 0){
              json.coordinates = result.coordinates;
            }
            if (result.id > 0){
              json.filialen[result.id-1].coordinates = result.coordinates;
            }
          }
        }
      }
    }
    deferred.resolve(json);
  });

  return deferred.promise;  
}



/**
 * Let the fun begin
 */
for (var i = 1, ii= 1000; i<ii; i+=1){
  fetchURL(i).then(function(json){
    return geoCodeAddresses(json);
  }).then(function(json){
    writeFile(json.id, json);
  }).fail(function(err){
    console.log(err);
  });
}
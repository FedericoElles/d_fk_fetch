var cheerio = require('cheerio');
var request = require('request');
var fs = require('fs');
var Q = require('q');

var DB = require('./db');

function getFromDB(street, city){
  var key = city+'+'+street;
  if (DB[key]){
    return DB[key];
  }
  return false;
}

for (var x in DB){
  console.log('DB', x);
}

/*
* Fetch data for URL
*/
function fetchURL(id){
  var deferred = Q.defer();
  var url = 'http://www.duesseldorf.de/cgi-bin/familienkarte/familienkarte.pl?detail=2&id='+id;
  request(url, {encoding: null}, function(error, response, html){
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
      var streetCount = 0;
      var usesFiliale = false;

      $('div[class=midLeft1] tr').each(function(i, elem) {
        success = true;

        attr = $(this).children().first().text();
        val = $(this).children().last().text()

        if (attr === 'Straße'){
          streetCount += 1;
        }

        if (attr === 'Filiale'){
          usesFiliale = true;
        }

        //console.log(!usesFiliale, attr === 'Straße', streetCount);
        //sometimes filialen does start with a street attribute, not a filiale attribute
        if (attr === 'Filiale' || (!usesFiliale && attr === 'Straße' && streetCount > 1)){
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
  console.log('writeFile', id, json);
  
  var text = JSON.stringify(json, null, 2);
  //console.log(text);
  fs.writeFileSync('data/'+id+'.json', text);
  console.log('File ' + id + ' written');
}

/*
 * Write file to FS
 */
function fileExists(id){
  return fs.existsSync('data/'+id+'.json');
}



function geoCodeAddress(id, street, city){
  //console.log('geoCode.address', address);
  var deferred = Q.defer();
  
  var coords = getFromDB(street, city);
  if (typeof coords === 'object'){
    //console.log('Address in DB: ', street, city, coords);
    deferred.resolve({
      status:'OK',
      id: id,
      coordinates: coords
    });
  } else {
    // //console.log('Address not in DB: ', street+'+'+city, DB[street+'+'+city]);
    // deferred.reject({
    //   status:'Error', 
    //   reason: 'Could not geocode address: ' + address, 
    //   error: 'Not found in DB'
    // });    

    
    
    var address =  street + ',' + city;
    
    //console.log('Coding address: '+ address);
    var url = 'https://maps.googleapis.com/maps/api/geocode/json?address='+encodeURIComponent(address)+
      '&key=AIzaSyBrGoUYi1blzWwj18x_6kC2oIzFzhQ63tA';
  
    request(url, function(error, response, html){
      if(!error){
        var json = JSON.parse(html);
        //console.log('Coding result: ', json);
        console.log('geoCode', json);
        if (json.results.length > 0){
          //console.log('Coding result: '+ json.results[0].geometry.location);
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
  }

  return deferred.promise;  
}


/**
 * Geocoding all available adresses
 */
function geoCodeAddresses(json){
  var deferred = Q.defer();

  var promises = [];
  if (json['Straße'] && json['Ort']){
    promises.push(geoCodeAddress(0, json['Straße'], json['Ort']));
  }
  for (var i = 0, ii = json.filialen.length; i<ii; i+=1) {
    var filiale = json.filialen[i];
    if (filiale['Straße'] && filiale['Ort']){
      promises.push(geoCodeAddress(i+1, filiale['Straße'], filiale['Ort']));
    }
  };

  Q.allSettled(promises).then(function(data){
    //console.log('coordinates available', data);
    var hasError = false;
    var errorData;
    
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
          } else {
            hasError = true;
            errorData = result;
          }
        }
      }
    }
    if (hasError){
      deferred.reject(errorData);
    } else {
      deferred.resolve(json);
    }
  });

  return deferred.promise;  
}



/**
 * Let the fun begin
 */
//var max = 100; // 668
var min = 1; //1;
var max = 100; // 668
//min = 268;
//max = 269;
var skipExisting = false;

var countWrites = 0;

for (var i = min, ii= max; i<ii; i+=1){
  if ((skipExisting && !fileExists(i)) || !skipExisting){
    fetchURL(i).then(function(json){
      return geoCodeAddresses(json);
    }).then(function(json){
      if (json.Angebot){
        if (json.coordinates){
          writeFile(json.id, json);
          countWrites++;
          console.log('Files writen...', countWrites);
        } else {
          console.log(json.id, 'No coordinates available');
        }
      } else {
        console.log(json.id, 'No Angebot available');
      }
    }).fail(function(err){
      console.log(err);
    });
  }

}

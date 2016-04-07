var dir = require('node-dir');
var fs = require('fs');

var DB = {};

var ctrl = {
	files: 0,
	addresses: 0
};

function addAddress(street, city, coordinates){
	DB[city+'+'+street] = coordinates;
	ctrl.addresses+=1;
}

dir.readFiles('data',
    function(err, content, next) {
        if (err) throw err;
        //console.log('content:', content);
		ctrl.files+=1;
		var json = JSON.parse(content);
		//fetch addresses
		if (json["Straße"] && json["Ort"] && json.coordinates){
			addAddress(json["Straße"], json["Ort"], json.coordinates);
		}
		if (json.filialen){
			json.filialen.forEach(function(filiale){
				if (filiale["Straße"] && filiale["Ort"] && filiale.coordinates){
					addAddress(json["Straße"], json["Ort"], json.coordinates);
				}	
			});
		}
        next();
    },
    function(err, files){
        if (err) throw err;
        //console.log('finished reading files:', files);
		console.log('Files: '+ ctrl.files);
		console.log('Addresses: '+ ctrl.addresses);
		
		fs.writeFile("db.json", JSON.stringify(DB), function(err) {
			if(err) {
				return console.log(err);
			}
		
			console.log("The file was saved!");
		}); 
    });
#!/usr/local/bin/node

var translations = require('./translations.js');
var file = `
<REQUEST>
	<LOGIN authenticationkey='428bde20f6034b5789f36563049bb9ca'/>
	<QUERY  runtime='true' lastmodified='true' orderby='AdvertisedTimeAtLocation' objecttype='TrainAnnouncement'>
		<FILTER>
			<AND>
				<EQ name='LocationSignature' value='Kb'/>
                <EQ name='InformationOwner' value='Öresundståg'/>
				<EQ name='Advertised' value='true'/>
				<EQ name='ActivityType' value='Avgang'/>

				<OR>
					<AND>
						<GT name='AdvertisedTimeAtLocation' value='$DateAdd(00:00:00)'/>
						<LT name='AdvertisedTimeAtLocation' value='$DateAdd(00:30:00)'/>
					</AND>
				</OR>
			</AND>
		</FILTER>
	</QUERY>
</REQUEST>
`
var config = require('./config.json');
var requester = require('request');
var js2xmlparser = require("js2xmlparser");
var rightPad = require('pad-right')

var apikey = config.apikey;
var url = config.apiurl;

function main() {
	// TimeAtLocation avgang
	getAnnouncementsForKungsbacka(function(announcements) {

		var trainId = getTrainIdFromAnnouncements(announcements);

		if (!trainId) return console.log('No departures found..')


		console.log('Tåg id:', trainId)
		getTrainInfoByTrainId( trainId, render)

	})

}
main();


function render(stations) {
	// header
	console.log(rightPad('Station', 16, ' '), rightPad('Annonserad', 12, ' '), 'Avgång')
	
	stations.forEach(function(a) {

		var src = (a.AdvertisedTimeAtLocation)
		var dst = (a.TimeAtLocation)

		var location = translations[a.LocationSignature] || "_"+ a.LocationSignature;
		var diff = getMinutesBetweenDates(new Date(src), new Date(dst))

		if(isNaN(diff)) diff = "..";
		if (diff == 0) diff = " " + diff;
		if (diff > 0) diff = "+" + diff;


		console.log(
			rightPad(location, 16, ' '), 
			rightPad(stripdate(src), 12, ' '),
			diff
		);
	})

}

function getAnnouncementsForKungsbacka(callback) {
	requester({
		method: 'POST',
		contentType: 'text/xml',
		uri: url,
		body: file
	}, function(err, res) {
			if (err && err.code == "ENOTFOUND" && err.syscall == "getaddrinfo") return console.log("Probably no internet..");
			else if (err) throw err;

			var body = JSON.parse(res.body);

			var result = body.RESPONSE.RESULT;
			var announcements = result[0].TrainAnnouncement;
			callback(announcements)
	})
}

function getTrainIdFromAnnouncements(announcements) {

    // filer by trains leaving from Hd, Dk.kh moving to Göteborg
    var matches = announcements.filter(function(a) {

    	var src = a.FromLocation.some(function(location) {
    		return location.LocationName == "Hd" || location.LocationName == "Dk.kh"
    	})

    	var dst = a.ToLocation.some(function(location) {
    		return location.LocationName == "G"
    	})

    	return src && dst;
    })
    if (matches.length == 0) {
    	return null;
    }
    else if (matches.length > 1) {
    	console.log(JSON.stringify(matches, null, 2));
    	throw Error("Too many trains on the dancefloor! " + matches.length + " trains");
    }

    var trainId = matches[0].AdvertisedTrainIdent;

    return trainId;
}

function getTrainInfoByTrainId(trainId, callback) {
	var req = {
		LOGIN: {
			'@': {authenticationkey: apikey}

		},
		QUERY: {
			'@': {
				orderby: 'AdvertisedTimeAtLocation asc',
				objecttype: 'TrainAnnouncement'
			},
			FILTER: {
				AND: {
					EQ: [
						{
							'@': {
								name: 'ActivityType',
								value: 'Avgang'
							}
						},
						{
							'@': {
								name: 'AdvertisedTrainIdent',
								value: trainId
							}
						}
						],
					GT: {
						'@': {
							name: 'AdvertisedTimeAtLocation',
							value: '$DateAdd(-01:00:00)'
						}
					},
					LT: {
						'@': {
							name: 'AdvertisedTimeAtLocation',
							value: '$DateAdd(01:00:00)'
						}
					}
				}
			}
		}
	}

	var requestTrainInfo = js2xmlparser("REQUEST", JSON.stringify(req));

    requester({
		method: 'POST',
		contentType: 'text/xml',
		uri: url,
		body: requestTrainInfo
		}, function(err, res, body) {
			if (err) throw err;
			var info = JSON.parse(res.body)
			if (!info.RESPONSE.RESULT[0].TrainAnnouncement) console.log("No TrainAnnouncement for trainId", trainId);
			var data = info.RESPONSE.RESULT[0].TrainAnnouncement;
    		callback(data)
	})
}

function stripdate(timestamp) {
	if (!timestamp) return "";
	return timestamp.split('T')[1];
}

function getMinutesBetweenDates(startDate, endDate) {
    var diff = endDate.getTime() - startDate.getTime();
    return (diff / 60000);
}

function calculateTimeDiff(expected, actual) {
	var expectedTime = expected.split('T')[1].split(':');
	var actualTime = actual.split('T')[1].split(':');

	//console.log()
	return +actualTime[1] - +expectedTime[1];
}



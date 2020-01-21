// Utilities
require('dotenv').config();
const axios = require('axios');
axios.defaults.baseURL = process.env.CENTRAL_APP_URL;
axios.defaults.headers.common['Authorization'] = process.env.AUTH_TOKEN;
axios.defaults.headers.post['Content-Type'] = 'application/json';

const jsonfile = require('jsonfile');
const fileName = 'data/imsi.json';
var imsi_cache = [];
jsonfile
	.readFile(fileName)
	.then(obj => {
		imsi_cache = obj;
		let ts = new Date();

		console.log(`${ts}: Currently cached devices .....`);	
		console.log(imsi_cache);
		console.log('\n');
	})
	.catch(error => console.error(error));

// const getSwedishDate = require('../lib/util').getSwedishDate;

// IoT HUB
var Registry = require('azure-iothub').Registry;
var connectionString = process.env.CONNECTION_STRING;
var registry = Registry.fromConnectionString(connectionString);

const getImsiForDevice = deviceId => {
	const found = imsi_cache.find(element => element.deviceId == deviceId);
	if (found) return found;
	else return false;
};

const updateTags = (tags, res, deviceId, type) => {
	if (type == 'hub') {
		let ts = new Date();
		console.log(`${ts}: will write ${JSON.stringify(tags)} to iot hub`);
		registry.getTwin(deviceId, function(err, twin) {
			if (err) {
				console.log('-----------------------------------------------------------------------')
				console.log(err)
				console.log('-----------------------------------------------------------------------')
				res.status(404);
				res.send('device not provisioned in iot hub');
			} else {
				let twinPatch = {
					tags,
				};
				twin.update(twinPatch, function(err, twin) {
					if (err) {
						console.log('-----------------------------------------------------------------------')
						console.log(err)
						console.log('-----------------------------------------------------------------------')						
						res.status(500);
						res.send('error reading twin tags');
					} else {
						res.status(200);
						res.send('ok');
					}
				});
			}
		});
	} else {
		// this is a IoT Central device
		let url = '/api/preview/devices/' + deviceId + '/cloudProperties';
		let IMSI = tags.subscriptionData.imsi;
		let IMEI = tags.subscriptionData.imei;
		let CustomerId = tags.subscriptionData.customerNo;
		let ts = new Date();
		console.log(`${ts}: will write ${JSON.stringify(tags)} to IoT Central`);

		let data = {
			IMSI,
			IMEI,
			CustomerId,
		};
		let options = {
			url: url,
			method: 'put',
			timeout: 5000,
			data
		};

		axios
			.request(options)
			.then(function(response) {
				res.status(200);
				res.send('ok');
			})
			.catch(function(error) {
				console.log('-----------------------------------------------------------------------')
				console.log(error)
				console.log('-----------------------------------------------------------------------')
				res.status(error.response.status);
				res.send(error.response.data.error.message);
			});
	}
};

//
// IOTA SOPA APIS
//
const soap = require('soap');
const remove = require('../lib/params.json');

const sm_url = process.env.SUBSCRIPTION_MANAGEMENT_URL;
const at_url = process.env.AGGREGATED_TRAFFIC_URL;
const st_url = process.env.SUBSCRIPTION_TRAFFIC_URL;

const options = {
	actor: 'actor',
	mustUnderstand: true,
	hasTimeStamp: false,
	hasTokenCreated: false,
};
const wsSecurity = new soap.WSSecurity(process.env.IOTA_USER, process.env.IOTA_PASSWD, options);

/*
 * fetch subscription management tags
 */
const getIotaData = (res, deviceId, id, type) => {
	soap.createClient(sm_url, function(err, client) {
		if (err) {
			console.log('-----------------------------------------------------------------------')
			console.log(err)
			console.log('-----------------------------------------------------------------------')			
			res.status(500)
			res.send(err.message);
		} else {
			client.setSecurity(wsSecurity);
			let args = { resource: { id, type: 'imsi' } };

			client.QuerySimResource(args, function(err, result) {
				if (err) {
					console.log('-----------------------------------------------------------------------')
					console.log(err)
					console.log('-----------------------------------------------------------------------')					
					res.status(500)
					res.send(err.message);
				} else {
					subscriptionData = result.SimResource;
					for (var i = 0; i < remove.SubscriptionManagement.length; i++) {
						delete subscriptionData[remove.SubscriptionManagement[i]];
					}
					let tags = {
						subscriptionData: 0,
						subscriptionTraffic: 0,
						trafficData: 0,
					};
					tags.subscriptionData = subscriptionData;
					// get traffic data only after this because we need the customer number
					getST(res, deviceId, tags, id, type);
				}
			});
		}
	});
};

/* ---------------------------------------------------------------------------------
 * fetch aggregated traffic tags
 * currently not used
 * ----------------------------------------------------------------------------------

const getTD = (res, deviceId) => {
  soap.createClient(at_url, function (err, client) {
    if (err) {
      console.error('ERROR WHEN GETTING AGGREGATED TRAFFIC WSDL: ' + err.message);
      res.send('ERROR WHEN GETTING AGGREGATED TRAFFIC WSDL: ' + err.message);
    } else {
      client.setSecurity(wsSecurity);

      let yesterday = getSwedishDate()
      let args = {
        customerno,
        aggregateOn: 'Operator'
      };
      client.queryAsync(args, function (err, result) {
        if (err) {
          console.error('ERROR WHEN QUERYING TRAFFIC DATA: ' + err.message);
          res.send('ERROR WHEN QUERYING TRAFFIC DATA: ' + err.message);
        } else {
          
          let trafficData = result.trafficUsage[0];
          for (var i = 0; i < remove.AggregatedTraffic.length; i++) {
            delete trafficData[remove.AggregatedTraffic[i]]
          }
          tags.trafficData = trafficData;
          updateTags(tags, res, deviceId);
        }
      });
    }
  });
}
 * --------------------------------------------------------------------------------- 
 */

/* ---------------------------------------------------------------------------------
 * fetch subscription traffic tags
 * ---------------------------------------------------------------------------------
 */

const getST = (res, deviceId, tags, id, type) => {
	soap.createClient(st_url, function(err, client) {
		if (err) {
			console.log('-----------------------------------------------------------------------')
			console.log(err)
			console.log('-----------------------------------------------------------------------')			
			res.status(500);
			res.send(err.message);
		} else {
			client.setSecurity(wsSecurity);

			let args = { resource: { id, type: 'imsi' } };

			client.query(args, function(err, result) {
				if (err) {
					console.log('-----------------------------------------------------------------------')
					console.log(err)
					console.log('-----------------------------------------------------------------------')					
					res.status(500);
					res.send(err.message);
				} else {
					subscriptionTraffic = result.traffic[0];

					for (var i = 0; i < remove.SubscriptionTraffic.length; i++) {
						delete subscriptionTraffic[remove.SubscriptionTraffic[i]];
					}
					tags.subscriptionTraffic = subscriptionTraffic;
					updateTags(tags, res, deviceId, type);
				}
			});
		}
	});
};

// API
const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
	res.status(200);
	res.send('ok');
});

//
// IMSI PROVISIONING
//
router.post('/device/:deviceId', function(req, res, next) {
	let deviceId = req.params.deviceId;
	let found = getImsiForDevice(deviceId);
	let ts = new Date();

	if (!found) {
		// IMSI is not cached, cache it
		console.log(`${ts}: provision ${deviceId} with ${req.body.imsi}`);
		let type = req.body.type;
		let imsi = req.body.imsi;
		let subscriptionData = { imsi };
		let tags = { subscriptionData };
		imsi_cache.push({ deviceId, imsi, type });
		jsonfile.writeFile(fileName, imsi_cache, err => {
			if (err) {
				console.log('-----------------------------------------------------------------------')
				console.log(err)
				console.log('-----------------------------------------------------------------------')				
				res.status(500);
				res.send('file system error when updating cache');
			} else {
				updateTags(tags, res, deviceId, type); // write imsi on twin tag
			}
		});
	} else {
		console.log(`${ts}: device already provisioned`);
		res.status(403);
		res.send('device already provisioned');
	}
});

router.delete('/device/:deviceId', function(req, res, next) {
	let deviceId = req.params.deviceId;
	let found = getImsiForDevice(deviceId);

	if (!found) {
		// IMSI is not cached
		res.status(404);
		res.send('device not yet provisioned');
	} else {
		let index = imsi_cache.indexOf(found);
		imsi_cache.splice(index, 1);
		jsonfile.writeFile(fileName, imsi_cache, err => {
			if (err) {
				console.log('-----------------------------------------------------------------------')
				console.log(err)
				console.log('-----------------------------------------------------------------------')				
				res.status(500);
				res.send('file system error when updating cache');
			} else {
				res.status(404);
				res.send('imsi removed from device');				
			}
		});
	}
});

//
// TAGS PROVISIONING
//
router.post('/tags/:deviceId', function(req, res, next) {
	let deviceId = req.params.deviceId;
	let found = getImsiForDevice(deviceId);

	if (!found) {	// IMSI is not cached
		res.status(404);
		res.send('device not yet provisioned');
	} else {
		getIotaData(res, deviceId, found.imsi, found.type);
	}
});

module.exports = router;

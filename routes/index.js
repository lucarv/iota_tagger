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
		console.log(imsi_cache);
	})
	.catch(error => console.error(error)); // const getSwedishDate = require('../lib/util').getSwedishDate;

// IoT HUB
var Registry = require('azure-iothub').Registry;
var connectionString = process.env.CONNECTION_STRING;
var registry = Registry.fromConnectionString(connectionString);

const getImsiForDevice = (deviceId) => {
	console.log(deviceId)
	const found = imsi_cache.find(element => element.deviceId == deviceId);
	console.log(found)
	if (found) return found;
	else return false;
};

const readTags = (res, deviceId) => {
	console.log(deviceId)
	registry.getTwin(deviceId, function(err, twin) {
		if (err) {
			res.render('error', {
				header: 'ERROR READING TWIN TAGS',
				message: err.name,
			});
		} else {
			console.log(twin.tags);
			let lu = twin.tags.subscriptionTraffic.lastLu;
			delete lu['status'];
			delete lu['gprsStatus'];
			let gprs = twin.tags.subscriptionTraffic.gprs;
			delete twin.tags.subscriptionTraffic['lastLu'];
			delete twin.tags.subscriptionTraffic['gprs'];

			let data = {
				sm: twin.tags.subscriptionData,
				st: twin.tags.subscriptionTraffic,
				lastLu: lu,
				gprs: gprs,
			};
			res.render('twindata', data);
		}
	});
};

const updateTags = (tags, res, deviceId, type) => {
	if (type == 'hub') {
		console.log(`will write ${JSON.stringify(tags)} to iot hub`);
		registry.getTwin(deviceId, function(err, twin) {
			if (err) {
				res.render('error', {
					header: 'ERROR FETCHING TWIN DOCUMENT',
					message: err.name,
				});
			} else {
				let twinPatch = {
					tags,
				};
				twin.update(twinPatch, function(err, twin) {
					if (err) {
						res.render('error', {
							header: 'ERROR READING TWIN TAGS',
							message: err.name,
						});
					} else {
						console.log('updated twin tags');
						res.render('imsi', {
							status: 'SUCCESSFULLY ASSOCIATED IMSI TO IOT DEVICE',
						});
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
		console.log(tags);
		let data = {
			IMSI,
			IMEI,
			CustomerId
		};
		//[, ]
		let options = {
			url: url,
			method: 'put',
			timeout: 5000,
			data,
		};

		axios
			.request(options)
			.then(function(response) {
				console.log(response);
				res.render('imsi', {
					status: `SUCCESSFULLY SET CLOUD PROPERTIES OF [${deviceId}]`,
				});
			})
			.catch(function(error) {
				var message = '';
				switch (error.response.status) {
					case 404:
						message = `Device: [${deviceId}] does not exist`;
						break;
					case 401:
						message = 'invalid token';
						break;
					default:
						message = 'unknown error';
						break;
				}
				res.render('error', {
					header: 'ERROR SETTING CLOUD PROPERTIES',
					message: message,
				});
			});
	}
};
//

// IOTA SOPA APIS
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
const getIotaData = (res, deviceId) => {
		soap.createClient(sm_url, function(err, client) {
		if (err) {
			res.render('error', {
				header: 'ERROR WHEN GETTING SUBSCRIPTION MANAGMENT WSDL',
				message: err.message,
			});
		} else {
			client.setSecurity(wsSecurity);
			let found = getImsiForDevice(deviceId);
			let id = found.imsi;
			let type = found.type;

			let args = {
				resource: {
					id,
					type: 'imsi',
				},
			};

			client.QuerySimResource(args, function(err, result) {
				if (err) {
					//res.send('ERROR WHEN QUERYING SIM RESOURCE: ' + err.message);
					res.render('error', {
						header: 'ERROR WHEN QUERYING SIM RESOURCE',
						message: err.message,
					});
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
					console.log('got SIM data');
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
			console.error(err);
			res.render('dummy', {
				title: 'ERROR WHEN QUERYING SIM RESOURCE',
			});
		} else {
			client.setSecurity(wsSecurity);

			let args = {
				resource: {
					id,
					type: 'imsi',
				},
			};

			client.query(args, function(err, result) {
				if (err) {
					res.render('error', {
						header: 'ERROR WHEN QUERYING SUBSCRIPTION RESOURCE',
						message: err.message,
					});
				} else {
					subscriptionTraffic = result.traffic[0];

					for (var i = 0; i < remove.SubscriptionTraffic.length; i++) {
						delete subscriptionTraffic[remove.SubscriptionTraffic[i]];
					}
					tags.subscriptionTraffic = subscriptionTraffic;
					console.log('got subscription data');
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
	res.render('index');
});

router.get('/imsi', function(req, res, next) {
	res.render('imsi');
});

router.get('/tagsmgmt', function(req, res, next) {
	res.render('tags');
});

router.get('/tags', function(req, res, next) {
	let deviceId = req.query.deviceId;
	let entry = getImsiForDevice(deviceId);

	console.log(entry);

	if (!entry) { // IMSI is not cached
		res.render('error', {
			header: 'ERROR WHEN FETCHING TAGS',
			message: 'imsi not known',
		});
	} else {
		if (entry.type == 'central') {
			res.render('error', {
				header: 'ERROR WHEN FETCHING TAGS',
				message: 'Device is in IoT Central. Use IoT Central App to read tags',
			});
		} else {
			readTags(res, deviceId);
		}
	}
});

router.post('/', function(req, res, next) {
	let deviceId = req.body.deviceId;
	if (!deviceId) {
		res.send('need device id');
	} else {
		getIotaData(res, deviceId);
	}
});

router.post('/imsi', function(req, res, next) {
	let deviceId = req.body.deviceId;
	if (!deviceId) {
		res.send('need device id');
	} else {
		let type = req.body.type;
		let imsi = req.body.imsi;
		let subscriptionData = {
			imsi,
		}
		console.log(subscriptionData);

		let tags = {
			subscriptionData
		};

		let found = getImsiForDevice(deviceId);

		if (!found) { // IMSI is not cached
			imsi_cache.push({
				deviceId,
				imsi,
				type
			});
			jsonfile.writeFile(fileName, imsi_cache, err => {
				if (err) {
					res.render('error', {
						header: 'ERROR WHEN SAVING IMSI TO CACHE',
						message: err.message,
					});
				} else {
					updateTags(tags, res, deviceId, type);
				}
			});
		} else {
			updateTags(tags, res, deviceId, type);
		}
	}
});

module.exports = router;

// Utilities
require('dotenv').config()
// const getSwedishDate = require('../lib/util').getSwedishDate;

// IoT HUB
var Registry = require('azure-iothub').Registry;
var connectionString = process.env.CONNECTION_STRING;
var registry = Registry.fromConnectionString(connectionString);

const getImsiForDevice = (deviceId) => {
  console.log(imsi_cache)
  const found = imsi_cache.find(element => element.deviceId == deviceId);
  return found.imsi;
} 

const readTags = (res, deviceId) => {
  registry.getTwin(deviceId, function (err, twin) {
    if (err) {
      res.send(err.message);
    } else {
      let lu = twin.tags.subscriptionTraffic.lastLu;
      delete lu['status']
      delete lu['gprsStatus']
      let gprs = twin.tags.subscriptionTraffic.gprs;
      delete twin.tags.subscriptionTraffic['lastLu'];
      delete twin.tags.subscriptionTraffic['gprs'];

      let data = {
        sm: twin.tags.subscriptionData,
        st: twin.tags.subscriptionTraffic,
        lastLu: lu,
        gprs: gprs
      }
      console.log(data)
      res.render('twindata', data);
    }
  });
}

const updateTags = (tags, res, deviceId) => {
  registry.getTwin(deviceId, function (err, twin) {
    if (err) {
      console.error(err.message);
    } else {
      let twinPatch = {
        tags
      };
      twin.update(twinPatch, function (err, twin) {
        if (err) {
          console.error('ERROR WHEN WRITING TWIN DOC: ' + err.message)
          res.send('ERROR WHEN WRITING TWIN DOC: ' + err.message);
        } else {
          res.render('index');
        }
      });
    }
  });
}

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
  hasTokenCreated: false
};
const wsSecurity = new soap.WSSecurity(process.env.USER, process.env.PASSWD, options)
var imsi_cache = [];

/*
 * fetch subscription management tags
 */
const fetch = (res, deviceId) => {
  soap.createClient(sm_url, function (err, client) {
    if (err) {
      console.error('ERROR WHEN GETTING SUBSCRIPTION MANAGMENT WSDL: ' + err.message);
      res.send('ERROR WHEN GETTING SUBSCRIPTION MANAGMENT WSDL: ' + err.message)
    } else {
      client.setSecurity(wsSecurity);
      let id = getImsiForDevice(deviceId);
      let args = {
        "resource": {
          id,
          type: 'imsi'
        }
      }
      client.QuerySimResource(args, function (err, result) {
        if (err) {
          console.error('ERROR WHEN QUERYING SIM RESOURCE: ' + err.message);
          res.send('ERROR WHEN QUERYING SIM RESOURCE: ' + err.message);
        } else {
          subscriptionData = result.SimResource;
          for (var i = 0; i < remove.SubscriptionManagement.length; i++) {
            delete subscriptionData[remove.SubscriptionManagement[i]]
          }
          let tags = {
            "subscriptionData": 0,
            "subscriptionTraffic": 0,
            "trafficData": 0
          };
          tags.subscriptionData = subscriptionData;
          // get traffic data only after this because we need the customer number
          getST(res, deviceId, tags);
        }
      });
    }
  });
}


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

const getST = (res, deviceId, tags) => {
  soap.createClient(st_url, function (err, client) {
    if (err) console.error(err)
    else {
      client.setSecurity(wsSecurity);
      let args = {
        "resource": {
          id: deviceId,
          type: 'imsi'
        }
      }

      client.query(args, function (err, result) {
        if (err) {
          console.log('error')
        } else {
          subscriptionTraffic = result.traffic[0];
          console.log(subscriptionTraffic)

          for (var i = 0; i < remove.SubscriptionTraffic.length; i++) {
            delete subscriptionTraffic[remove.SubscriptionTraffic[i]]
          }
          tags.subscriptionTraffic = subscriptionTraffic;
          updateTags(tags, res, deviceId);
        }
      });
    }
  });
}


// API
const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index');
});

router.get('/imsi', function (req, res, next) {
  res.render('imsi');
});

router.get('/tagsmgmt', function (req, res, next) {
  res.render('tags');
});

router.get('/tags', function (req, res, next) {
  readTags(res, req.query.deviceId)
});

router.post('/', function (req, res, next) {
  let deviceId = req.body.deviceId;
  if (!deviceId) {
    res.send('need device id');
  } else {
    fetch(res, deviceId);
  }
});

router.post('/imsi', function (req, res, next) {
  let imsi = req.body.imsi
  let deviceId = req.body.deviceId;

  if (!deviceId) {
    res.send('need device id');
  } else {
    let tags = {
      "subscriptionData": 0
    };
    tags.subscriptionData.imsi = imsi;
    //updateTags(tags, res, deviceId);
    let map = {deviceId, imsi}
    console.log(map)
    imsi_cache.push(map);
    res.render('tags');

  }
});

module.exports = router;
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OneM2MClient = exports.oneM2MClient = void 0;
var express_1 = __importDefault(require("express"));
var http_1 = __importDefault(require("http"));
var js2xmlparser_1 = __importDefault(require("js2xmlparser"));
var xml2js_1 = __importDefault(require("xml2js"));
var shortid_1 = __importDefault(require("shortid"));
var cbor_1 = __importDefault(require("cbor"));
var globalData_1 = require("./globalData");
var ocf_client_1 = require("./ocf_client");
var ONEM2M_RESOURCE_TYPE;
(function (ONEM2M_RESOURCE_TYPE) {
    ONEM2M_RESOURCE_TYPE["AE"] = "2";
    ONEM2M_RESOURCE_TYPE["CONTAINER"] = "3";
    ONEM2M_RESOURCE_TYPE["CONTENT_IUNSTANCE"] = "4";
})(ONEM2M_RESOURCE_TYPE || (ONEM2M_RESOURCE_TYPE = {}));
var OneM2MClient = /** @class */ (function () {
    function OneM2MClient() {
        var _this = this;
        this.app = express_1.default();
        this.server = null;
        this.coap_server = null;
        this.mqtt_sub_client = null;
        this.count_q = {};
        this.mqtt_init = function () {
        };
        this.ws_init = function () {
        };
        this.onem2m_option = globalData_1.globalData.conf.onem2m;
        if (this.onem2m_option.protocol === 'mqtt') {
            this.mqtt_init();
        }
        else if (this.onem2m_option.protocol === 'ws') {
            this.ws_init();
        }
        this.app.use(express_1.default.json());
        this.app.post('/*', function (req, res) {
            // 응답 객체
            var responseData = {};
            // 응답 status
            var responseStatus;
            // notification 으로 들어옴
            // {
            //     "sgn" : {
            //         "nev" : {
            //             "rep" : RESOURCE
            //         }
            //     }
            // }
            var notiRoot = req.body;
            if (notiRoot == undefined || notiRoot.sgn == undefined || notiRoot.sgn.nev == undefined
                || notiRoot.sgn.nev.rep == undefined || notiRoot.sgn.nev.rep.rn == undefined) {
                responseStatus = 404;
                responseData.responseCode = "4004";
                responseData.responseMessage = "Request Data Not Valid";
            }
            else {
                var resource = notiRoot.sgn.nev.rep;
                var resourceName = resource.rn;
                globalData_1.globalData.eventEmitter.emit('download_' + resourceName, resource, function (ctn, notificationData) {
                    var content = notificationData.con;
                    var mapp = {};
                    for (var i = 0; i < globalData_1.globalData.conf.ocf.download.length; i++) {
                        if (ctn.name == globalData_1.globalData.conf.ocf.download[i].ctname) {
                            mapp = globalData_1.globalData.conf.ocf.download[i];
                            break;
                        }
                    }
                    if (mapp.ctname) {
                        // const _that = this;
                        var temp = mapp.id.split('/');
                        var deviceId = temp[0];
                        var ocfResourceName = temp.slice(1).join('/');
                        var uri = 'coap' + '://' + globalData_1.globalData.conf.ocf.host + ':' + globalData_1.globalData.conf.ocf.port + '/' + ocfResourceName;
                        var sendData = undefined;
                        try {
                            sendData = JSON.parse(content);
                        }
                        catch (e) {
                            sendData = content;
                            console.log(e);
                        }
                        ocf_client_1.ocfClient.ocf_request_put(uri, sendData, function (_res) {
                            console.log("ocf data request put");
                            console.log(_res);
                        });
                    }
                });
                responseStatus = 200;
                responseData.responseCode = "2000";
                responseData.responseMessage = "Success";
            }
            res.status(responseStatus);
            res.send(responseData);
        });
        this.app.listen(this.onem2m_option.port, this.onem2m_option.host, function () {
            console.log("app listening at http://" + _this.onem2m_option.host + ":" + _this.onem2m_option.port);
        });
    }
    OneM2MClient.prototype.http_request = function (path, method, ty, bodyString, callback) {
        var _that = this;
        var options = {
            hostname: this.onem2m_option.csebase.host,
            port: this.onem2m_option.csebase.port,
            path: path,
            method: method,
            headers: {
                'X-M2M-RI': shortid_1.default.generate(),
                'Accept': 'application/' + this.onem2m_option.bodytype,
                'X-M2M-Origin': this.onem2m_option.ae.id,
                'Locale': 'en'
            }
        };
        if (bodyString.length > 0) {
            options.headers['Content-Length'] = bodyString.length;
        }
        if (method === 'post') {
            var a = (ty === '') ? '' : ('; ty=' + ty);
            options.headers['Content-Type'] = 'application/vnd.onem2m-res+' + this.onem2m_option.bodytype + a;
        }
        else if (method === 'put') {
            options.headers['Content-Type'] = 'application/vnd.onem2m-res+' + this.onem2m_option.bodytype;
        }
        var res_body = '';
        var req = http_1.default.request(options, function (res) {
            //console.log('[crtae response : ' + res.statusCode);
            //res.setEncoding('utf8');
            res.on('data', function (chunk) {
                res_body += chunk;
            });
            res.on('end', function () {
                if (_that.onem2m_option.bodytype === 'xml') {
                    var parser = new xml2js_1.default.Parser({ explicitArray: false });
                    parser.parseString(res_body, function (err, jsonObj) {
                        if (err) {
                            console.log('[http_adn] xml parse error]');
                            jsonObj = {};
                            jsonObj.dbg = res_body;
                            callback(res, jsonObj);
                        }
                        else {
                            callback(res, jsonObj);
                        }
                    });
                }
                else if (_that.onem2m_option.bodytype === 'cbor') {
                    cbor_1.default.decodeFirst(res_body, function (err, jsonObj) {
                        if (err) {
                            console.log('[http_adn] cbor parse error]');
                            jsonObj = {};
                            jsonObj.dbg = res_body;
                            callback(res, jsonObj);
                        }
                        else {
                            callback(res, jsonObj);
                        }
                    });
                }
                else {
                    var jsonObj = void 0;
                    try {
                        jsonObj = JSON.parse(res_body);
                        callback(res, jsonObj);
                    }
                    catch (e) {
                        console.log('[http_adn] json parse error]');
                        jsonObj = {};
                        jsonObj.dbg = res_body;
                        callback(res, jsonObj);
                    }
                }
            });
        });
        req.on('error', function (e) {
            console.log('problem with request: ' + e.message);
        });
        //console.log(bodyString);
        console.log(path);
        req.write(bodyString);
        req.end();
    };
    ///////////
    OneM2MClient.prototype.create_ae = function (parent, rn, api, callback) {
        if (globalData_1.globalData.conf.onem2m.protocol === globalData_1.PROTOCOL_TYPE.HTTP) {
            var results_ae = {};
            var bodyString = '';
            if (globalData_1.globalData.conf.onem2m.bodytype === globalData_1.BODY_TYPE.XML) {
                results_ae['api'] = api;
                // @ts-ignore
                results_ae['rr'] = true;
                results_ae['@'] = {
                    "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
                    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                    "rn": rn
                };
                bodyString = js2xmlparser_1.default.parse("m2m:ae", results_ae);
                console.log(bodyString);
            }
            else if (globalData_1.globalData.conf.onem2m.bodytype === globalData_1.BODY_TYPE.CBOR) {
                results_ae['m2m:ae'] = {};
                results_ae['m2m:ae'].api = api;
                results_ae['m2m:ae'].rn = rn;
                results_ae['m2m:ae'].rr = true;
                bodyString = cbor_1.default.encode(results_ae).toString('hex');
                console.log(bodyString);
            }
            else {
                results_ae['m2m:ae'] = {};
                results_ae['m2m:ae'].api = api;
                results_ae['m2m:ae'].rn = rn;
                results_ae['m2m:ae'].rr = true;
                //results_ae['m2m:ae'].acpi = '/mobius-yt/acp1';
                // TODO notification uri 설정해야됨
                //results_ae['m2m:ae'].acpi = '/mobius-yt/acp1';
                bodyString = JSON.stringify(results_ae);
            }
            this.http_request(parent, globalData_1.HTTP_METHOD.POST, ONEM2M_RESOURCE_TYPE.AE, bodyString, function (res, res_body) {
                callback(res.headers['x-m2m-rsc'], res_body);
            });
        }
        // else if(onem2m_options.protocol === 'mqtt') {
        //     var rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = parent;
        //
        //     var req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '1'; // create
        //     req_message['m2m:rqp'].to = parent;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].ty = '2'; // ae
        //     req_message['m2m:rqp'].pc = {};
        //     req_message['m2m:rqp'].pc['m2m:ae'] = {};
        //     req_message['m2m:rqp'].pc['m2m:ae'].rn = rn;
        //     req_message['m2m:rqp'].pc['m2m:ae'].api = api;
        //     req_message['m2m:rqp'].pc['m2m:ae'].rr = 'true';
        //
        //     if (onem2m_options.bodytype == 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         req_message['m2m:rqp'].pc['m2m:ae']['@'] = {"rn": rn};
        //         delete req_message['m2m:rqp'].pc['m2m:ae'].rn;
        //
        //         var bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //         console.log(bodyString);
        //
        //         mqtt_client.publish(req_topic, bodyString);
        //
        //         console.log(req_topic + ' (' + rqi + ' - xml) ---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         mqtt_client.publish(req_topic, bodyString);
        //         console.log(req_topic + ' (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         mqtt_client.publish(req_topic, JSON.stringify(req_message['m2m:rqp']));
        //
        //         console.log(req_topic + ' (json) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        // }
        // else if(onem2m_options.protocol === 'coap') {
        //     results_ae = {};
        //
        //     bodyString = '';
        //
        //     if(onem2m_options.bodytype === 'xml') {
        //         results_ae.api = api;
        //         results_ae.rr = 'true';
        //         results_ae['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        //             "rn" : rn
        //         };
        //
        //         bodyString = js2xmlparser.parse("m2m:ae", results_ae);
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         results_ae['m2m:ae'] = {};
        //         results_ae['m2m:ae'].api = api;
        //         results_ae['m2m:ae'].rn = rn;
        //         results_ae['m2m:ae'].rr = true;
        //         bodyString = cbor.encode(results_ae).toString('hex');
        //         console.log(bodyString);
        //     }
        //     else {
        //         results_ae['m2m:ae'] = {};
        //         results_ae['m2m:ae'].api = api;
        //         results_ae['m2m:ae'].rn = rn;
        //         results_ae['m2m:ae'].rr = true;
        //         //results_ae['m2m:ae'].acpi = '/mobius-yt/acp1';
        //         bodyString = JSON.stringify(results_ae);
        //     }
        //
        //     coap_request(parent, 'post', '2', bodyString, function (res, res_body) {
        //         for (var idx in res.options) {
        //             if (res.options.hasOwnProperty(idx)) {
        //                 if (res.options[idx].name === '265') { // 'X-M2M-RSC
        //                     var rsc = (Buffer.isBuffer(res.options[idx].value) ? res.options[idx].value.readUInt16BE(0).toString() : res.options[idx].value.toString());
        //                     break;
        //                 }
        //             }
        //         }
        //         callback(rsc, res_body);
        //     });
        // }
        // else if(onem2m_options.protocol === 'ws') {
        //     rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = parent;
        //
        //     req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '1'; // create
        //     req_message['m2m:rqp'].to = parent;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].ty = '2'; // ae
        //     req_message['m2m:rqp'].pc = {};
        //     req_message['m2m:rqp'].pc['m2m:ae'] = {};
        //     req_message['m2m:rqp'].pc['m2m:ae'].rn = rn;
        //     req_message['m2m:rqp'].pc['m2m:ae'].api = api;
        //     req_message['m2m:rqp'].pc['m2m:ae'].rr = 'true';
        //
        //     if (onem2m_options.bodytype === 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         req_message['m2m:rqp'].pc['m2m:ae']['@'] = {"rn": rn};
        //         delete req_message['m2m:rqp'].pc['m2m:ae'].rn;
        //
        //         bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //
        //         ws_connection.sendUTF(bodyString);
        //         console.log('websocket (xml)' + rqi + '---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         console.log(bodyString);
        //         ws_connection.sendUTF(bodyString);
        //         console.log('websocket (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         ws_connection.sendUTF(JSON.stringify(req_message['m2m:rqp']));
        //         console.log('websocket (json) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        // }
    };
    ;
    OneM2MClient.prototype.retrieve_ae = function (target, callback) {
        if (this.onem2m_option.protocol === globalData_1.PROTOCOL_TYPE.HTTP) {
            this.http_request(target, globalData_1.HTTP_METHOD.GET, '', '', function (res, res_body) {
                callback(res.headers['x-m2m-rsc'], res_body);
            });
        }
        // else if (onem2m_options.protocol === 'mqtt') {
        //     var rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = target;
        //
        //     var req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '2'; // retrieve
        //     req_message['m2m:rqp'].to = target;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].pc = {};
        //
        //     if (onem2m_options.bodytype === 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         var bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //         console.log(bodyString);
        //
        //         mqtt_client.publish(req_topic, bodyString);
        //
        //         console.log(req_topic + ' (' + rqi + ' - xml) ---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         mqtt_client.publish(req_topic, bodyString);
        //         console.log(req_topic + ' (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         mqtt_client.publish(req_topic, JSON.stringify(req_message['m2m:rqp']));
        //
        //         console.log(req_topic + ' (json) ---->');
        //     }
        // }
        // else if(onem2m_options.protocol === 'coap') {
        //     coap_request(target, 'get', '', '', function (res, res_body) {
        //         for (var idx in res.options) {
        //             if (res.options.hasOwnProperty(idx)) {
        //                 if (res.options[idx].name === '265') { // 'X-M2M-RSC
        //                     var rsc = (Buffer.isBuffer(res.options[idx].value) ? res.options[idx].value.readUInt16BE(0).toString() : res.options[idx].value.toString());
        //                     break;
        //                 }
        //             }
        //         }
        //         callback(rsc, res_body);
        //     });
        // }
        // else if(onem2m_options.protocol === 'ws') {
        //     rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = target;
        //
        //     req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '2'; // retrieve
        //     req_message['m2m:rqp'].to = target;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].pc = {};
        //
        //     if (onem2m_options.bodytype === 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //
        //         ws_connection.sendUTF(bodyString);
        //         console.log('websocket (xml) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         console.log(bodyString);
        //         ws_connection.sendUTF(bodyString);
        //         console.log('websocket (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         ws_connection.sendUTF(JSON.stringify(req_message['m2m:rqp']));
        //         console.log('websocket (json) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        // }
    };
    ;
    OneM2MClient.prototype.create_container = function (parent, rn, count, callback) {
        if (globalData_1.globalData.conf.onem2m.protocol === globalData_1.PROTOCOL_TYPE.HTTP) {
            var results_ct = {};
            var bodyString = '';
            if (globalData_1.globalData.conf.onem2m.bodytype === globalData_1.BODY_TYPE.XML) {
                results_ct['lbl'] = rn;
                results_ct['@'] = {
                    "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
                    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                    "rn": rn
                };
                bodyString = js2xmlparser_1.default.parse("m2m:cnt", results_ct);
            }
            else if (globalData_1.globalData.conf.onem2m.bodytype === globalData_1.BODY_TYPE.CBOR) {
                results_ct['m2m:cnt'] = {};
                results_ct['m2m:cnt'].rn = rn;
                results_ct['m2m:cnt'].lbl = [rn];
                bodyString = cbor_1.default.encode(results_ct).toString('hex');
                console.log(bodyString);
            }
            else {
                results_ct['m2m:cnt'] = {};
                results_ct['m2m:cnt'].rn = rn;
                results_ct['m2m:cnt'].lbl = [rn];
                bodyString = JSON.stringify(results_ct);
                console.log(bodyString);
            }
            this.http_request(parent, globalData_1.HTTP_METHOD.POST, ONEM2M_RESOURCE_TYPE.CONTAINER, bodyString, function (res, res_body) {
                console.log(count + ' - ' + parent + '/' + rn + ' - x-m2m-rsc : ' + res.headers['x-m2m-rsc'] + ' <----');
                console.log(res_body);
                callback(res.headers['x-m2m-rsc'], res_body, count);
            });
        }
        // else if(onem2m_options.protocol === 'mqtt') {
        //     var rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //     count_q[rqi] = count;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = parent;
        //
        //     var req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '1'; // create
        //     req_message['m2m:rqp'].to = parent;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].ty = '3'; // cnt
        //     req_message['m2m:rqp'].pc = {};
        //     req_message['m2m:rqp'].pc['m2m:cnt'] = {};
        //     req_message['m2m:rqp'].pc['m2m:cnt'].rn = rn;
        //     req_message['m2m:rqp'].pc['m2m:cnt'].lbl = [];
        //     req_message['m2m:rqp'].pc['m2m:cnt'].lbl.push(rn);
        //
        //     if (onem2m_options.bodytype === 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         req_message['m2m:rqp'].pc['m2m:cnt']['@'] = {"rn": rn};
        //         delete req_message['m2m:rqp'].pc['m2m:cnt'].rn;
        //
        //         var bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //         console.log(bodyString);
        //
        //         mqtt_client.publish(req_topic, bodyString);
        //
        //         console.log(req_topic + ' (' + rqi + ' - xml) ---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         mqtt_client.publish(req_topic, bodyString);
        //         console.log(req_topic + ' (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         mqtt_client.publish(req_topic, JSON.stringify(req_message['m2m:rqp']));
        //
        //         console.log(req_topic + ' (json) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        // }
        // else if(onem2m_options.protocol === 'coap') {
        //     var results_ct = {};
        //
        //     var bodyString = '';
        //     if(onem2m_options.bodytype === 'xml') {
        //         results_ct.lbl = rn;
        //         results_ct['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        //             "rn": rn
        //         };
        //
        //         bodyString = js2xmlparser.parse("m2m:cnt", results_ct);
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         results_ct['m2m:cnt'] = {};
        //         results_ct['m2m:cnt'].rn = rn;
        //         results_ct['m2m:cnt'].lbl = [rn];
        //         bodyString = cbor.encode(results_ct).toString('hex');
        //         console.log(bodyString);
        //     }
        //     else {
        //         results_ct['m2m:cnt'] = {};
        //         results_ct['m2m:cnt'].rn = rn;
        //         results_ct['m2m:cnt'].lbl = [rn];
        //         bodyString = JSON.stringify(results_ct);
        //     }
        //
        //     coap_request(parent, 'post', '3', bodyString, function (res, res_body) {
        //         for (var idx in res.options) {
        //             if (res.options.hasOwnProperty(idx)) {
        //                 if (res.options[idx].name === '265') { // 'X-M2M-RSC
        //                     var rsc = (Buffer.isBuffer(res.options[idx].value) ? res.options[idx].value.readUInt16BE(0).toString() : res.options[idx].value.toString());
        //                     break;
        //                 }
        //             }
        //         }
        //         console.log(count + ' - ' + parent + '/' + rn + ' - x-m2m-rsc : ' + rsc + ' <----');
        //         callback(rsc, res_body, count);
        //     });
        // }
        // else if(onem2m_options.protocol === 'ws') {
        //     rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //     count_q[rqi] = count;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = parent;
        //
        //     req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '1'; // create
        //     req_message['m2m:rqp'].to = parent;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].ty = '3'; // cnt
        //     req_message['m2m:rqp'].pc = {};
        //     req_message['m2m:rqp'].pc['m2m:cnt'] = {};
        //     req_message['m2m:rqp'].pc['m2m:cnt'].rn = rn;
        //     req_message['m2m:rqp'].pc['m2m:cnt'].lbl = [];
        //     req_message['m2m:rqp'].pc['m2m:cnt'].lbl.push(rn);
        //
        //     if (onem2m_options.bodytype === 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         req_message['m2m:rqp'].pc['m2m:cnt']['@'] = {"rn": rn};
        //         delete req_message['m2m:rqp'].pc['m2m:cnt'].rn;
        //
        //         bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //
        //         ws_connection.sendUTF(bodyString);
        //         console.log('websocket (xml) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         console.log(bodyString);
        //         ws_connection.sendUTF(bodyString);
        //         console.log('websocket (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         ws_connection.sendUTF(JSON.stringify(req_message['m2m:rqp']));
        //         console.log('websocket (json) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        // }
    };
    ;
    OneM2MClient.prototype.retrieve_container = function (target, count, callback) {
        if (globalData_1.globalData.conf.onem2m.protocol === globalData_1.PROTOCOL_TYPE.HTTP) {
            this.http_request(target, globalData_1.HTTP_METHOD.GET, '', '', function (res, res_body) {
                console.log(count + ' - ' + target + ' - x-m2m-rsc : ' + res.headers['x-m2m-rsc'] + ' <----');
                console.log(res_body);
                callback(res.headers['x-m2m-rsc'], res_body, count);
            });
        }
        // else if(onem2m_options.protocol === 'mqtt') {
        //     var rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = target;
        //
        //     var req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '2'; // retrieve
        //     req_message['m2m:rqp'].to = target;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].pc = {};
        //
        //     if (onem2m_options.bodytype === 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         var bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //         console.log(bodyString);
        //
        //         mqtt_client.publish(req_topic, bodyString);
        //
        //         console.log(req_topic + ' (' + rqi + ' - xml) ---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         mqtt_client.publish(req_topic, bodyString);
        //         console.log(req_topic + ' (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         mqtt_client.publish(req_topic, JSON.stringify(req_message['m2m:rqp']));
        //
        //         console.log(req_topic + ' (json) ---->');
        //     }
        // }
        // else if(onem2m_options.protocol === 'coap') {
        //     // to do
        // }
        // else if(onem2m_options.protocol === 'ws') {
        //     rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = target;
        //
        //     req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '2'; // retrieve
        //     req_message['m2m:rqp'].to = target;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].pc = {};
        //
        //     if (onem2m_options.bodytype === 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //
        //         ws_connection.sendUTF(bodyString);
        //         console.log(req_topic + ' (' + rqi + ' - xml) ---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         console.log(bodyString);
        //         ws_connection.sendUTF(bodyString);
        //         console.log('websocket (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         ws_connection.sendUTF(JSON.stringify(req_message['m2m:rqp']));
        //         console.log('websocket (json) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        // }
    };
    ;
    OneM2MClient.prototype.create_contentInstance = function (parent, count, content, socket, callback) {
        if (globalData_1.globalData.conf.onem2m.protocol === globalData_1.PROTOCOL_TYPE.HTTP) {
            var results_ci = {};
            var bodyString = '';
            if (globalData_1.globalData.conf.onem2m.bodytype === globalData_1.BODY_TYPE.XML) {
                results_ci['con'] = content;
                results_ci['@'] = {
                    "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
                    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
                };
                bodyString = js2xmlparser_1.default.parse("m2m:cin", results_ci);
            }
            else if (globalData_1.globalData.conf.onem2m.bodytype === globalData_1.BODY_TYPE.CBOR) {
                results_ci['m2m:cin'] = {};
                results_ci['m2m:cin'].con = content;
                bodyString = cbor_1.default.encode(results_ci).toString('hex');
                console.log(bodyString);
            }
            else {
                results_ci['m2m:cin'] = {};
                results_ci['m2m:cin'].con = content;
                bodyString = JSON.stringify(results_ci);
            }
            this.http_request(parent, globalData_1.HTTP_METHOD.POST, ONEM2M_RESOURCE_TYPE.CONTENT_IUNSTANCE, bodyString, function (res, res_body) {
                callback(res.headers['x-m2m-rsc'], res_body, parent, socket);
            });
        }
        // else if(onem2m_options.protocol === 'mqtt') {
        //     var rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = parent;
        //     socket_q[rqi] = socket;
        //
        //     var req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '1'; // create
        //     req_message['m2m:rqp'].to = parent;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].ty = '4'; // cin
        //     req_message['m2m:rqp'].pc = {};
        //     req_message['m2m:rqp'].pc['m2m:cin'] = {};
        //     req_message['m2m:rqp'].pc['m2m:cin'].con = content;
        //
        //     if (onem2m_options.bodytype === 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         var bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //         console.log(bodyString);
        //
        //         mqtt_client.publish(req_topic, bodyString);
        //
        //         console.log(req_topic + ' (' + rqi + ' - xml) ---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         mqtt_client.publish(req_topic, bodyString);
        //         console.log(req_topic + ' (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         mqtt_client.publish(req_topic, JSON.stringify(req_message['m2m:rqp']));
        //
        //         console.log(req_topic + ' (json) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        // }
        // else if(onem2m_options.protocol === 'coap') {
        //     results_ci = {};
        //     bodyString = '';
        //     if(onem2m_options.bodytype === 'xml') {
        //         results_ci.con = content;
        //
        //         results_ci['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         bodyString = js2xmlparser.parse("m2m:cin", results_ci);
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         results_ci['m2m:cin'] = {};
        //         results_ci['m2m:cin'].con = content;
        //         bodyString = cbor.encode(results_ci).toString('hex');
        //         console.log(bodyString);
        //     }
        //     else {
        //         results_ci['m2m:cin'] = {};
        //         results_ci['m2m:cin'].con = content;
        //
        //         bodyString = JSON.stringify(results_ci);
        //     }
        //
        //     coap_request(parent, 'post', '4', bodyString, function (res, res_body) {
        //         for (var idx in res.options) {
        //             if (res.options.hasOwnProperty(idx)) {
        //                 if (res.options[idx].name === '265' || (res.options[idx].name === 265)) { // 'X-M2M-RSC
        //                     var rsc = (Buffer.isBuffer(res.options[idx].value) ? res.options[idx].value.readUInt16BE(0).toString() : res.options[idx].value.toString());
        //                     break;
        //                 }
        //             }
        //         }
        //         callback(rsc, res_body, parent, socket);
        //     });
        // }
        // else if(onem2m_options.protocol === 'ws') {
        //     rqi = shortid.generate();
        //
        //     callback_q[rqi] = callback;
        //
        //     resp_mqtt_ri_arr.push(rqi);
        //     resp_mqtt_path_arr[rqi] = parent;
        //     socket_q[rqi] = socket;
        //
        //     req_message = {};
        //     req_message['m2m:rqp'] = {};
        //     req_message['m2m:rqp'].op = '1'; // create
        //     req_message['m2m:rqp'].to = parent;
        //     req_message['m2m:rqp'].fr = onem2m_options.aei;
        //     req_message['m2m:rqp'].rqi = rqi;
        //     req_message['m2m:rqp'].ty = '4'; // cin
        //     req_message['m2m:rqp'].pc = {};
        //     req_message['m2m:rqp'].pc['m2m:cin'] = {};
        //     req_message['m2m:rqp'].pc['m2m:cin'].con = content;
        //
        //     if (onem2m_options.bodytype === 'xml') {
        //         req_message['m2m:rqp']['@'] = {
        //             "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
        //             "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
        //         };
        //
        //         var bodyString = js2xmlparser.parse("m2m:rqp", req_message['m2m:rqp']);
        //
        //         ws_connection.sendUTF(bodyString);
        //         console.log('websocket (xml) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        //     else if(onem2m_options.bodytype === 'cbor') {
        //         bodyString = cbor.encode(req_message['m2m:rqp']).toString('hex');
        //         console.log(bodyString);
        //         ws_connection.sendUTF(bodyString);
        //         console.log('websocket (cbor) ' + bodyString + ' ---->');
        //     }
        //     else { // 'json'
        //         ws_connection.sendUTF(JSON.stringify(req_message['m2m:rqp']));
        //         console.log('websocket (json) ' + JSON.stringify(req_message['m2m:rqp']) + ' ---->');
        //     }
        // }
    };
    ;
    return OneM2MClient;
}());
exports.OneM2MClient = OneM2MClient;
var oneM2MClient = new OneM2MClient();
exports.oneM2MClient = oneM2MClient;

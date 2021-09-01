import fs from 'fs';
import express from 'express';
import http from 'http';
import mqtt from 'mqtt';
import coap from 'coap';
import WebSocketClient from 'websocket';
import bodyParser from 'body-parser';
import js2xmlparser from 'js2xmlparser';
import xml2js from 'xml2js';
import shortid from 'shortid';
import cbor from 'cbor';

import {
    globalData,
    Option,
    OneM2MOption,
    HTTP_METHOD,
    PROTOCOL_TYPE,
    BODY_TYPE,
    Container,
    ONEM2M_STATE
} from '../globalData';
import {ocfClient, OCF_OneM2M_Mapp} from "../ocf/ocf_client";

enum ONEM2M_RESOURCE_TYPE {
    AE = '2',
    CONTAINER = '3',
    CONTENT_IUNSTANCE = '4'
}

class OneM2MClient {

    app = express();
    server = null;
    coap_server = null;
    mqtt_sub_client = null;
    count_q = {};
    onem2m_option:OneM2MOption ;

    constructor() {
        this.onem2m_option = globalData.conf.onem2m;
        if(this.onem2m_option.protocol === 'mqtt') {
            this.mqtt_init();
        }
        else if(this.onem2m_option.protocol === 'ws') {
            this.ws_init();
        }

        this.app.use(express.json());
        this.app.post('/*', (req, res) => {
            // 응답 객체
            let responseData = {} as ResponseData ;
            // 응답 status
            let responseStatus;

            // notification 으로 들어옴
            // {
            //     "sgn" : {
            //         "nev" : {
            //             "rep" : RESOURCE
            //         }
            //     }
            // }

            let notiRoot:NotificationRoot = req.body;

            if (notiRoot == undefined || notiRoot.sgn == undefined || notiRoot.sgn.nev == undefined
                || notiRoot.sgn.nev.rep == undefined || notiRoot.sgn.nev.rep.rn == undefined) {
                responseStatus = 404;
                responseData.responseCode = "4004";
                responseData.responseMessage = "Request Data Not Valid";

            } else {

                let resource = notiRoot.sgn.nev.rep;
                let resourceName = resource.rn;

                globalData.eventEmitter.emit('download_'+resourceName, resource, function(ctn :Container, notificationData){
                    let content = notificationData.con;

                    let mapp:OCF_OneM2M_Mapp = {} as OCF_OneM2M_Mapp;
                    for (let i = 0; i < globalData.conf.ocf.download.length; i++) {
                        if (ctn.name == globalData.conf.ocf.download[i].ctname) {
                            mapp = globalData.conf.ocf.download[i];
                            break;
                        }
                    }

                    if (mapp.ctname) {
                        // const _that = this;
                        const temp = mapp.id.split('/');
                        const deviceId = temp[0];
                        const ocfResourceName = temp.slice(1).join('/');

                        const uri = 'coap' +'://'+ globalData.conf.ocf.host + ':' + globalData.conf.ocf.port +'/'+ocfResourceName;
                        let sendData = undefined;
                        try{
                            sendData = JSON.parse(content);
                        } catch (e) {
                            sendData = content;
                            console.log(e);
                        }

                        ocfClient.ocf_request_put(uri, sendData, function (_res){
                            console.log("ocf data request put");
                            console.log(_res);
                        })
                    }
                });

                responseStatus = 200;
                responseData.responseCode = "2000";
                responseData.responseMessage = "Success";
            }

            res.status(responseStatus);
            res.send(responseData);
        })

        this.app.listen(this.onem2m_option.port, this.onem2m_option.host, () => {
            console.log(`app listening at http://${this.onem2m_option.host}:${this.onem2m_option.port}`)
        });
    }

    public init(){

        let request_count = 0;

        const request_oneM2M_setting = function() {
            if (globalData.sh_state == ONEM2M_STATE.CREATE_AE) {
                oneM2MClient.create_ae(globalData.conf.onem2m.ae.parent, globalData.conf.onem2m.ae.name, globalData.conf.onem2m.ae.appid, create_ae_callback);
            } else if (globalData.sh_state == ONEM2M_STATE.RETRIVE_AE) {
                request_count = 0;
                oneM2MClient.retrieve_ae(globalData.conf.onem2m.ae.parent + '/' + globalData.conf.onem2m.ae.name, retrieve_ae_callback);
            } else if (globalData.sh_state == ONEM2M_STATE.RETRIVE_CONTAINER) {
                let data = globalData.conf.onem2m.ae.ctn[request_count];
                oneM2MClient.retrieve_container(globalData.conf.onem2m.ae.parent + '/' + globalData.conf.onem2m.ae.name + '/' + data.name, request_count , retrieve_container_callback);
            } else if (globalData.sh_state == ONEM2M_STATE.CREATE_CONTAINER) {
                let data = globalData.conf.onem2m.ae.ctn[request_count];
                oneM2MClient.create_container(globalData.conf.onem2m.ae.parent + '/' + globalData.conf.onem2m.ae.name, data.name, request_count , create_container_callback);
            }
        }
        setTimeout(request_oneM2M_setting, 100);
        /**
         * onem2m ae resource create call back
         * @param status
         * @param res_body
         */
        const create_ae_callback = function (status, res_body) {
            console.log(res_body);
            if (status == 2001) {
                globalData.sh_state = ONEM2M_STATE.RETRIVE_AE;
                setTimeout(request_oneM2M_setting, 100);
            } else if (status == 5106 || status == 4105) {
                console.log('x-m2m-rsc : ' + status + ' <----');
                globalData.sh_state = ONEM2M_STATE.RETRIVE_AE;
                setTimeout(request_oneM2M_setting, 100);
            } else {
                console.log('[???} create container error!  ', status + ' <----');
                // setTimeout(setup_resources, 3000, 'crtae');
            }
        }

        /**
         * onem2m ae resource retrieve call back
         * @param status
         * @param res_body
         */
        const retrieve_ae_callback = function (status, res_body){
            if (status == 2000) {
                let aeid = res_body['m2m:ae']['aei'];
                console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');

                if(globalData.conf.onem2m.ae.id != aeid && globalData.conf.onem2m.ae.id != ('/'+aeid)) {
                    console.log('AE-ID created is ' + aeid + ' not equal to device AE-ID is ' + globalData.conf.onem2m.ae.id);
                } else {
                    request_count = 0;
                    globalData.sh_state = ONEM2M_STATE.RETRIVE_CONTAINER;
                    setTimeout(request_oneM2M_setting, 100);
                }
            } else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                globalData.sh_state =  ONEM2M_STATE.CREATE_AE;
                setTimeout(request_oneM2M_setting, 1000);
            }
        }

        const retrieve_container_callback = function (status, res_body, count){
            console.log(res_body);
            if (status == 2000) {
                request_count ++;
                // 아직 container 가 남아 있다면
                if (request_count <= globalData.conf.onem2m.ae.ctn.length - 1) {
                    globalData.sh_state =  ONEM2M_STATE.RETRIVE_CONTAINER;
                    setTimeout(request_oneM2M_setting, 100);
                    // 마지막 container 까지 다 돌 경우
                } else {
                    console.log('all container created ');
                    // 여기서 이제 다음 처리해야됨 .. 주기적으로 ocf 데이터 조회해서 데이터 전달 하는 로직
                    // 아니면 observe 설정해서 데이터 수신 받을 때마다 oneM2M으로 데이터 전달
                    ocfClient.observeSetting();
                }
            } else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                globalData.sh_state =  ONEM2M_STATE.CREATE_CONTAINER;
                setTimeout(request_oneM2M_setting, 100);
            }
        }

        const create_container_callback = function(status, res_body, count) {
            if (status == 5106 || status == 2001 || status == 4105) {
                // request_count ++;
                globalData.sh_state =  ONEM2M_STATE.RETRIVE_CONTAINER;
                setTimeout(request_oneM2M_setting, 100);
            } else {
                console.log('[???} create container error!');
            }

            // if(conf.cnt.length == 0) {
            //     callback(2001, count);
            // }
            // else {
            //     if(conf.cnt.hasOwnProperty(count)) {
            //         let parent = conf.cnt[count].parent;
            //         let rn = conf.cnt[count].name;
            //         onem2m_client.create_cnt(parent, rn, count, function (rsc, res_body, count) {
            //             if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
            //                 create_cnt_all(++count, function (status, count) {
            //                     callback(status, count);
            //                 });
            //             }
            //             else {
            //                 callback(9999, count);
            //             }
            //         });
            //     }
            //     else {
            //         callback(2001, count);
            //     }
            // }

        }
    }

    private mqtt_init = function(){

    };
    private ws_init = function(){

    };

    private http_request(path, method, ty, bodyString, callback) {
        let _that = this;

        let options = {
            hostname: this.onem2m_option.csebase.host,
            port: this.onem2m_option.csebase.port,
            path: path,
            method: method,
            headers: {
                'X-M2M-RI': shortid.generate(),
                'Accept': 'application/' + this.onem2m_option.bodytype,
                'X-M2M-Origin': this.onem2m_option.ae.id,
                'Locale': 'en'
            }
        };

        if(bodyString.length > 0) {
            options.headers['Content-Length'] = bodyString.length;
        }

        if(method === HTTP_METHOD.POST) {
            let a = (ty==='') ? '': ('; ty='+ty);
            options.headers['Content-Type'] = 'application/vnd.onem2m-res+' + this.onem2m_option.bodytype + a;
        }
        else if(method === HTTP_METHOD.PUT) {
            options.headers['Content-Type'] = 'application/vnd.onem2m-res+' + this.onem2m_option.bodytype;
        }

        let res_body = '';
        let req = http.request(options, function (res) {
            //console.log('[crtae response : ' + res.statusCode);
            //res.setEncoding('utf8');
            res.on('data', function (chunk) {
                res_body += chunk;
            });

            res.on('end', function () {
                if(_that.onem2m_option.bodytype === 'xml') {
                    var parser = new xml2js.Parser({explicitArray: false});
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
                } else if(_that.onem2m_option.bodytype === 'cbor') {
                    cbor.decodeFirst(res_body, function(err, jsonObj) {
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
                } else {

                    let jsonObj;
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
        // console.log(path);

        req.write(bodyString);
        req.end();
    }

    ///////////
    public create_ae(parent, rn, api, callback) {
        if(globalData.conf.onem2m.protocol === PROTOCOL_TYPE.HTTP) {

            let results_ae = {};
            let bodyString = '';

            if (globalData.conf.onem2m.bodytype === BODY_TYPE.XML) {
                results_ae['api'] = api;
                // @ts-ignore
                results_ae['rr'] = true;
                results_ae['@'] = {
                    "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
                    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                    "rn": rn
                };

                bodyString = js2xmlparser.parse("m2m:ae", results_ae);

                console.log(bodyString);
            }
            else if (globalData.conf.onem2m.bodytype === BODY_TYPE.CBOR) {
                results_ae['m2m:ae'] = {};
                results_ae['m2m:ae'].api = api;
                results_ae['m2m:ae'].rn = rn;
                results_ae['m2m:ae'].rr = true;
                bodyString = cbor.encode(results_ae).toString('hex');
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

            this.http_request(parent, HTTP_METHOD.POST, ONEM2M_RESOURCE_TYPE.AE, bodyString, function (res, res_body) {
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


    public retrieve_ae (target, callback) {
        if (this.onem2m_option.protocol === PROTOCOL_TYPE.HTTP) {
            this.http_request(target, HTTP_METHOD.GET, '', '', function (res, res_body) {
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

    public create_container(parent, rn, count, callback) {
        if(globalData.conf.onem2m.protocol === PROTOCOL_TYPE.HTTP) {
            let results_ct = {};

            let bodyString = '';
            if (globalData.conf.onem2m.bodytype === BODY_TYPE.XML) {
                results_ct['lbl'] = rn;
                results_ct['@'] = {
                    "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
                    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
                    "rn": rn
                };

                bodyString = js2xmlparser.parse("m2m:cnt", results_ct);
            }
            else if(globalData.conf.onem2m.bodytype === BODY_TYPE.CBOR) {
                results_ct['m2m:cnt'] = {};
                results_ct['m2m:cnt'].rn = rn;
                results_ct['m2m:cnt'].lbl = [rn];
                bodyString = cbor.encode(results_ct).toString('hex');
                console.log(bodyString);
            }
            else {
                results_ct['m2m:cnt'] = {};
                results_ct['m2m:cnt'].rn = rn;
                results_ct['m2m:cnt'].lbl = [rn];
                bodyString = JSON.stringify(results_ct);
                console.log(bodyString);
            }

            this.http_request(parent, HTTP_METHOD.POST, ONEM2M_RESOURCE_TYPE.CONTAINER, bodyString, function (res, res_body) {
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

    public retrieve_container(target, count, callback) {
        if(globalData.conf.onem2m.protocol === PROTOCOL_TYPE.HTTP) {
            this.http_request(target, HTTP_METHOD.GET, '', '', function (res, res_body) {
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



    public create_contentInstance(parent, count, content, socket, callback) {
        if(globalData.conf.onem2m.protocol === PROTOCOL_TYPE.HTTP) {
            let results_ci = {};
            let bodyString = '';
            if (globalData.conf.onem2m.bodytype === BODY_TYPE.XML) {
                results_ci['con'] = content;

                results_ci['@'] = {
                    "xmlns:m2m": "http://www.onem2m.org/xml/protocols",
                    "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance"
                };

                bodyString = js2xmlparser.parse("m2m:cin", results_ci);
            }
            else if (globalData.conf.onem2m.bodytype === BODY_TYPE.CBOR) {
                results_ci['m2m:cin'] = {};
                results_ci['m2m:cin'].con = content;
                bodyString = cbor.encode(results_ci).toString('hex');
                console.log(bodyString);
            }
            else {
                results_ci['m2m:cin'] = {};
                results_ci['m2m:cin'].con = content;

                bodyString = JSON.stringify(results_ci);
            }

            this.http_request(parent, HTTP_METHOD.POST, ONEM2M_RESOURCE_TYPE.CONTENT_IUNSTANCE, bodyString, function (res, res_body) {
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
}

// {
//     "sgn" : {
//         "nev" : {
//             "rep" : RESOURCE
//         }
//     }
// }

interface NotificationRoot {
    sgn : Notification
}

interface Notification {
    nev : NotificationEvent
}

interface NotificationEvent {
    rep : Resource
}

interface Resource {
    rn : string;    //resourceName
    ty : number;    //resourceType
    ri : string;    //resourceID
    pi : string;    //parentID
}

interface ResponseData {
    responseCode : string;
    responseMessage : string;
    data : any;
}


const oneM2MClient = new OneM2MClient();
export {oneM2MClient, OneM2MClient}




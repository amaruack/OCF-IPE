"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ocfClient = void 0;
var coap_1 = __importDefault(require("coap"));
var cbor_1 = __importDefault(require("cbor"));
var url_1 = __importDefault(require("url"));
var globalData_1 = require("./globalData");
var oneM2M_client_1 = require("./oneM2M_client");
var OCF_MEDIA_TYPE = {
    APPLICATION_CBOR: { name: 'application/cbor', value: 60 },
    APPLICATION_VND_OCF_CBOR: { name: 'application/vnd.ocf+cbor', value: 10000 }
};
var OCF_OBSERVE_CODE = 0;
var OcfClient = /** @class */ (function () {
    function OcfClient() {
        this.that = this;
        this.init();
    }
    OcfClient.prototype.ocf_request = function (target, _callback) {
        var url = url_1.default.parse(target);
        // url.method =
        // coap method 변경을 할 경우 해당 option을 통하여 처리 할 수 있다고 함
        // let coapConnection = {
        //     host: url.host,
        //     pathname: url.path,
        //     method: 'GET',
        //     confirmable: true
        // }
        var req = coap_1.default.request(url);
        // request 요청
        req.on('response', function (_res) {
            // cbor decoder 생성
            var d = new cbor_1.default.Decoder();
            d.on('data', function (obj) {
                _callback(obj);
            });
            _res.pipe(d);
            // _callback(cbor.decode(_res.payload));
        });
        req.end();
    };
    OcfClient.prototype.ocf_request_observe = function (target, _callback) {
        var url = url_1.default.parse(target);
        var coapConnection = {
            host: url.hostname,
            port: url.port,
            pathname: url.path,
            method: 'GET',
            confirmable: true,
            observe: true // 해당 데이터가 있어야 listening 처리 된다.
        };
        var req = coap_1.default.request(coapConnection);
        var ocfCborType = Buffer.from(OCF_MEDIA_TYPE.APPLICATION_VND_OCF_CBOR.value.toString(16), 'hex');
        req.setOption('Accept', ocfCborType);
        req.setOption('Observe', Buffer.from(OCF_OBSERVE_CODE.toString(16), 'hex')); // ocf observe option
        // request 요청
        req.on('response', function (_res) {
            // cbor decoder 생성
            var d = new cbor_1.default.Decoder();
            d.on('data', function (obj) {
                _callback(obj);
            });
            _res.pipe(d);
        });
        req.end();
    };
    // private hexStringToByteArray(hexString:String):Uint8Array {
    //     let convertString = hexString;
    //     if (hexString.length % 2 !== 0) {
    //         convertString = convertString.padStart(hexString.length+1, '0');
    //     }
    //     const hex = Uint8Array.from(Buffer.from(hexString, 'hex'));
    //     return hex;
    // }
    OcfClient.prototype.ocf_request_put = function (target, _data, _callback) {
        var url = url_1.default.parse(target);
        // url.method =
        // coap method 변경을 할 경우 해당 option을 통하여 처리 할 수 있음
        var coapConnection = {
            host: url.hostname,
            port: url.port,
            pathname: url.path,
            method: 'PUT',
            confirmable: false,
        };
        var req = coap_1.default.request(coapConnection);
        var ocfCborType = Buffer.from(OCF_MEDIA_TYPE.APPLICATION_VND_OCF_CBOR.value.toString(16), 'hex');
        req.setOption('Content-Format', ocfCborType);
        req.setOption('Accept', ocfCborType);
        var bytearray = Buffer.from(cbor_1.default.encode(_data));
        req.write(bytearray);
        // request 요청
        req.on('response', function (_res) {
            // cbor decoder 생성
            var d = new cbor_1.default.Decoder();
            d.on('data', function (obj) {
                _callback(obj);
            });
            _res.pipe(d);
            // _callback(cbor.decode(_res.payload));
        });
        req.end();
    };
    OcfClient.prototype.init = function () {
        var _loop_1 = function (i) {
            if (globalData_1.globalData.conf.ocf.observe) {
                // setTimeout(this.getOcfResourceData, 1000, this, globalData.conf.ocf.upload[i]);
                var temp = globalData_1.globalData.conf.ocf.upload[i].id.split('/');
                var ocfResourceName = temp.slice(1).join('/');
                var uri = 'coap' + '://' + globalData_1.globalData.conf.ocf.host + ':' + globalData_1.globalData.conf.ocf.port + '/' + ocfResourceName;
                this_1.ocf_request_observe(uri, function (data) {
                    // 데이터를 onem2m에 전달 해야됨 // eventemitter로 전달
                    globalData_1.globalData.eventEmitter.emit('upload_' + globalData_1.globalData.conf.ocf.upload[i].ctname, data, function (ctn, data) {
                        var content = data;
                        oneM2M_client_1.oneM2MClient.create_contentInstance(ctn.parent + '/' + ctn.name, '0', content, undefined, function (status, res_body) {
                            console.log('create_contentInstance callback');
                            console.log(res_body);
                        });
                    });
                });
            }
            else {
                setTimeout(this_1.getOcfResourceData, 1000, this_1, globalData_1.globalData.conf.ocf.upload[i]);
            }
        };
        var this_1 = this;
        // TODO 여기에서 OCF에 observe 요청 날리거나 주기적으로 데이터 요청 하는거 날려야됨 setTimeout
        // 추가적으로 response 받은 oic/res 에서 observe 가 가능한 데이터인지를 확인해야한다.
        for (var i = 0; i < globalData_1.globalData.conf.ocf.upload.length; i++) {
            _loop_1(i);
        }
    };
    // 데이터 조회
    OcfClient.prototype.getOcfResourceData = function (_this, mapp) {
        // const _that = this;
        var temp = mapp.id.split('/');
        var deviceId = temp[0];
        var ocfResourceName = temp.slice(1).join('/');
        var uri = 'coap' + '://' + globalData_1.globalData.conf.ocf.host + ':' + globalData_1.globalData.conf.ocf.port + '/' + ocfResourceName;
        _this.ocf_request(uri, function (data) {
            // 데이터를 onem2m에 전달 해야됨 // eventemitter로 전달
            globalData_1.globalData.eventEmitter.emit('upload_' + mapp.ctname, data, function (ctn, data) {
                var content = data;
                oneM2M_client_1.oneM2MClient.create_contentInstance(ctn.parent + '/' + ctn.name, '0', content, undefined, function (status, res_body) {
                    console.log('create_contentInstance callback');
                    console.log(res_body);
                });
            });
            // 재귀 호출
            setTimeout(_this.getOcfResourceData, 10000, _this, mapp);
        });
    };
    return OcfClient;
}());
var ocfClient = new OcfClient();
exports.ocfClient = ocfClient;

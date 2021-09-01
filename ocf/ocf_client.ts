import coap from 'coap';
import cbor from 'cbor';
import urlObject from 'url';
import {globalData, OCF_OneM2M_Mapp, Container} from "../globalData";
import {oneM2MClient} from "../onem2m/oneM2M_client";

// ocf media type
const OCF_MEDIA_TYPE = {
    APPLICATION_CBOR : {name : 'application/cbor', value : 60},
    APPLICATION_VND_OCF_CBOR : {name : 'application/vnd.ocf+cbor', value : 10000}
}
// ocf observe code
const OCF_OBSERVE_CODE = 0;
// 데이터 조회 주기 , millis
const RETRIEVE_TIME_INTERVAL = 10000;

class OcfClient {

    public that = this;

    constructor() {
        // this.init();
        const coapTiming = {
            ackTimeout: 0.25,
            ackRandomFactor: 1.0,
            maxRetransmit: 3,
            maxLatency: 2,
            piggybackReplyMs: 10
        }
        coap.updateTiming(coapTiming);

    }

    public init(){
        const that = this;
        // oic platform
        const oic_p_uri = 'coap' +'://'+ globalData.conf.ocf.host + ':' + globalData.conf.ocf.port +'/oic/p';
        this.ocf_request(oic_p_uri, function(_data:OCF_Platform_Response){
            if (!_data) {
                console.log(`ocf device not running ${globalData.conf.ocf.host}:${globalData.conf.ocf.port}`);
                process.exit(0);
            }
            // console.log('oic_p_uri response -------------');
            // console.log(_data);
        })

        // oic device
        const oic_d_uri = 'coap' +'://'+ globalData.conf.ocf.host + ':' + globalData.conf.ocf.port +'/oic/d';
        this.ocf_request(oic_d_uri, function(_data: OCF_Device_Response){
            if (!_data) {
                console.log(`ocf device not running ${globalData.conf.ocf.host}:${globalData.conf.ocf.port}`);
                process.exit(0);
            }
            // console.log('oic_d_uri response -------------');
            // console.log(_data);
        })

        // oic resource
        const oic_res_uri = 'coap' +'://'+ globalData.conf.ocf.host + ':' + globalData.conf.ocf.port +'/oic/res';
        this.ocf_request(oic_res_uri, function(_data){
            if (!_data) {
                console.log(`ocf device not running ${globalData.conf.ocf.host}:${globalData.conf.ocf.port}`);
                process.exit(0);
            }
            // console.log('oic_res_uri response -------------');
            // console.log(_data);
            const mergeAr = globalData.conf.ocf.download.concat(globalData.conf.ocf.upload);

            for (let stream of mergeAr) {
                let bl = false;
                for (let item of <OCF_Resource_Response[]>_data){
                    const tmp = item.anchor+item.href;
                    if (tmp.lastIndexOf(stream.id) > 0) {
                        bl = true;
                        break;
                    }
                }
                if (!bl) {
                    console.error(`resource not found ${stream.id}`);
                }
            }

            // 여기서 onem2m 프로세스를 진행해야 할 거 같은데
            setTimeout(that.onem2m_client_init, 100);
        })
    }

    public onem2m_client_init(){
        oneM2MClient.init();
    }

    public ocf_request(target : string, _callback){
        const url = urlObject.parse(target);
        const coapConnection = {
            host: url.hostname,
            port: url.port,
            pathname: url.path,
            method: 'GET',
            confirmable: true
        }

        const req = coap.request(coapConnection);
        let ocfCborType = Buffer.from(OCF_MEDIA_TYPE.APPLICATION_VND_OCF_CBOR.value.toString(16), 'hex');
        req.setOption('Accept', ocfCborType);
        // request 요청
        req.on('response', function(_res:any)  {
            // cbor decoder 생성
            const d = new cbor.Decoder();
            d.on('data', (obj:any) => {
                _callback(obj);
            });
            _res.pipe(d);
            // _callback(cbor.decode(_res.payload));
        });

        req.on('timeout', function(err) {
            console.error(err);
            _callback();
        });

        req.on('error', function(err) {
            console.log('coap request error');
            // _callback();
            // console.error(err);
        });

        req.end();

    }

    public ocf_request_observe(target : string, _callback){
        let url = urlObject.parse(target);
        let coapConnection = {
            host: url.hostname,
            port: url.port,
            pathname: url.path,
            method: 'GET',
            confirmable: true,
            observe :true  // 해당 데이터가 있어야 listening 처리 된다.
        }
        let req = coap.request(coapConnection);
        let ocfCborType = Buffer.from(OCF_MEDIA_TYPE.APPLICATION_VND_OCF_CBOR.value.toString(16), 'hex');

        req.setOption('Accept', ocfCborType);
        req.setOption('Observe', Buffer.from(OCF_OBSERVE_CODE.toString(16), 'hex')); // ocf observe option

        // request 요청
        req.on('response', function(_res:any)  {
            // cbor decoder 생성
            const d = new cbor.Decoder();
            d.on('data', (obj:any) => {
                _callback(obj);
            });
            _res.pipe(d);

        });

        req.end()
    }

    public ocf_request_put(target : string, _data, _callback){
        let url = urlObject.parse(target);
        // url.method =
        // coap method 변경을 할 경우 해당 option을 통하여 처리 할 수 있음
        let coapConnection = {
            host: url.hostname,
            port: url.port,
            pathname: url.path,
            method: 'PUT',
            confirmable: false,
        }

        const req = coap.request(coapConnection);

        let ocfCborType = Buffer.from(OCF_MEDIA_TYPE.APPLICATION_VND_OCF_CBOR.value.toString(16), 'hex');

        req.setOption('Content-Format', ocfCborType);
        req.setOption('Accept', ocfCborType);

        let bytearray = Buffer.from(cbor.encode(_data));
        req.write(bytearray);

        // request 요청
        req.on('response', function(_res:any)  {
            // cbor decoder 생성
            const d = new cbor.Decoder();
            d.on('data', (obj:any) => {
                _callback(obj);
            });
            _res.pipe(d);
            // _callback(cbor.decode(_res.payload));
        });

        req.end()
    }

    public observeSetting(){
        // TODO 여기에서 OCF에 observe 요청 날리거나 주기적으로 데이터 요청 하는거 날려야됨 setTimeout
        // 추가적으로 response 받은 oic/res 에서 observe 가 가능한 데이터인지를 확인해야한다.
        for (let i = 0; i < globalData.conf.ocf.upload.length; i++) {

            if (globalData.conf.ocf.observe) {
                const temp = globalData.conf.ocf.upload[i].id.split('/');
                const ocfResourceName = temp.slice(1).join('/');
                const uri = 'coap' +'://'+ globalData.conf.ocf.host + ':' + globalData.conf.ocf.port +'/'+ocfResourceName;

                this.ocf_request_observe(uri, function(data) {
                    // 데이터를 onem2m에 전달 해야됨 // eventemitter로 전달
                    globalData.eventEmitter.emit('upload_'+globalData.conf.ocf.upload[i].ctname, data, function(ctn :Container, data){
                        let content = data;
                        oneM2MClient.create_contentInstance(ctn.parent + '/' + ctn.name, '0', content, undefined, function(status, res_body){
                            console.log('create_contentInstance callback');
                            console.log(res_body);
                        });
                    });
                });
            } else {
                setTimeout(this.getOcfResourceData, RETRIEVE_TIME_INTERVAL, this, globalData.conf.ocf.upload[i]);
            }
        }
    }

    // 데이터 조회
    public getOcfResourceData(_this : OcfClient , mapp : OCF_OneM2M_Mapp){

        // const _that = this;
        const temp = mapp.id.split('/');
        const deviceId = temp[0];
        const ocfResourceName = temp.slice(1).join('/');

        const uri = 'coap' +'://'+ globalData.conf.ocf.host + ':' + globalData.conf.ocf.port +'/'+ocfResourceName;

        _this.ocf_request(uri, function(data){
            // 데이터를 onem2m에 전달 해야됨 // eventemitter로 전달
            globalData.eventEmitter.emit('upload_'+mapp.ctname, data, function(ctn :Container, data){
                let content = data;
                oneM2MClient.create_contentInstance(ctn.parent + '/' + ctn.name, '0', content, undefined, function(status, res_body){
                    console.log('create_contentInstance callback');
                    console.log(res_body);
                });
            });
            // 재귀 호출
            setTimeout(_this.getOcfResourceData, RETRIEVE_TIME_INTERVAL, _this, mapp);
        });
    }
}

const ocfClient = new OcfClient();

interface OCF_Platform_Response {
    pi : string ;
    mnmn : string ;
}

interface OCF_Device_Response {
    di : string ;   // device id
    piid : string ; // immutable id
    n : string ;    // name
    icv : string ;  // version
    dmv : string ;
}

interface OCF_Resource_Response {
    anchor : string ;
    href : string ;
    rt : string[] ;
    if : string[] ;
    p : any ;
    eps : OCP_EndPoint[] ;
}

interface OCP_EndPoint {
    ep : string ;
}

export {ocfClient, OCF_Resource_Response, OCP_EndPoint, OCF_OneM2M_Mapp}
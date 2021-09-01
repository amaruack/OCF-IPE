import {globalData, ONEM2M_STATE} from './globalData';
import {oneM2MClient} from './onem2m/oneM2M_client';
import {ocfClient, OCF_Resource_Response, OCP_EndPoint} from './ocf/ocf_client';

// const ocf_oic_d_receive = function(data){
//     console.log(data);
// }
// const ocf_oic_res_receive = function(datas){
//     console.log(datas);
//     datas.forEach(function(data:OCF_Resource_Response) {
//         let eps = data.eps;
//         eps.forEach(function(ep : OCP_EndPoint) {
//             console.log(ep.ep);
//         })
//     })
// }


const request_ocf_setting= function(){
    ocfClient.init();
}

setTimeout(request_ocf_setting, 100);



// @TODO TEST용도 삭제해야함
// ocfClient.ocf_request_observe("coap://10.10.0.198:64931/a/light", ocf_oic_d_receive);
// ocfClient.ocf_request_put("coap://10.10.0.198:51117/a/light", {value:false, dimmingSetting : 50}, ocf_oic_d_receive);
// // ocf device retrieve
// ocfClient.ocf_request("coap://10.10.0.198:5683/oic/res", ocf_oic_d_receive);
//
// // ocf resource retrieve
// ocfClient.ocf_request("coap://10.10.0.198:61327/oic/res", ocf_oic_res_receive );


// 1. 디바이스 설정 정보 조회 ( or OCF 디바이스 아이디 조회 및 리소스 조회 )
// 2. 디바이스 아이디를 통하여 oneM2M 디바이스 조회
// 3. 없으면 디바이스 생성

// aaaa. ocf discovery 처리 해야됨
// ocf oic/d, resource 를 찾아서 해당 upstream 및 downstream 설정 과 비교해야함

// 4-1. upstream 데이터 조회 or Observe (OCF - coap 조회 날려서 )
// 4-2. 조회한 데이터 contentInstance 생성 해서 oneM2M 서버로 전송

// 5-1. 수신 서버 설정 (oneM2M로부터 수신 받을 서버)
// 5-2. oneM2M notification resource 수신
// 5-3. OCF data put ?? 또는 특정 제어 전송


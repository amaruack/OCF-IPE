import {globalData, ONEM2M_STATE} from './globalData';
import {oneM2MClient} from './onem2m/oneM2M_client';
import {ocfClient, OCF_Resource_Response, OCP_EndPoint} from './ocf/ocf_client';

const ocf_oic_d_receive = function(data){
    console.log(data);
}
const ocf_oic_res_receive = function(datas){
    console.log(datas);
    datas.forEach(function(data:OCF_Resource_Response) {
        let eps = data.eps;
        eps.forEach(function(ep : OCP_EndPoint) {
            console.log(ep.ep);
        })
    })
}


// ocfClient.ocf_request_observe("coap://10.10.0.198:64931/a/light", ocf_oic_d_receive);
ocfClient.ocf_request_put("coap://10.10.0.198:5683/a/light", {value:false, dimmingSetting : 50}, ocf_oic_d_receive);
// // ocf device retrieve
ocfClient.ocf_request("coap://10.10.0.198:5683/a/light", ocf_oic_d_receive);
//
// // ocf resource retrieve
ocfClient.ocf_request("coap://10.10.0.198:61327/oic/res", ocf_oic_res_receive );


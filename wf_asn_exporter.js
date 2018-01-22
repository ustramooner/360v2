/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

define(['../src/lib/obj_asn_xml_gen','N/log','N/runtime'],
    function(asn_xml_gen, log, runtime) {


var logResult = function(title, details){
        log.debug({
            title: title,
            details: details
        });
    }

        function onAction(context) {

         
            var newRecord = context.newRecord;
            logResult('ASN ID', 'Loading ASN ID' + newRecord.id + '...');
            
          	asn_xml_gen.execute(newRecord.id);
            
          	logResult('ASN ID', 'ASN ID' + newRecord.id + ' has been loaded');
          
            /*var customerName = newRecord.getText('custrecord_asn_bill_to_customer')
            logResult('ASN Customer', customerName);

            if(customerName.toLowerCase().indexOf('merchsource') > -1 || customerName.toLowerCase().indexOf('innovage') > -1){            
                
            }else{
                logResult('ASN', 'Exiting...');
            }*/
        }
        return {
            onAction: onAction
        }
    }
);
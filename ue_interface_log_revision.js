/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */


define(['N/record','N/log', 'N/search'], function(record, log, search){


    function getInterfaceLogsByMSPO(msPOId){

        log.debug('MS PO ID', msPOId);
        var results = search.create({
            type : 'customrecord_ts2_interface_log',
            filters : [{
                name : 'custrecord_ts2_interface_mspo',
                operator : search.Operator.IS,
                values : [msPOId]
            }],
            title : 'Get Interface Logs'
        });

        if(results){
            return results.run().getRange(0,1000);
        }
        return [];
    }

    function afterSubmit(context){

        if(context.type === context.UserEventType.EDIT){

            var type = 'customrecord_ts2_interface_log';

            var rec = context.newRecord;
            var interfaceLog = record.load({
                type : type,
                id : rec.id
            });

            if(!interfaceLog.getValue('custrecord_ts2_interface_log_rev')){

                var interfaceLogsByMSPO = [];
                log.debug('MS PO ID', interfaceLog.getValue('custrecord_ts2_interface_mspo'));
                if(interfaceLog.getValue('custrecord_ts2_interface_mspo')){
                    interfaceLogsByMSPO = getInterfaceLogsByMSPO(interfaceLog.getValue('custrecord_ts2_interface_mspo'));
                    log.debug('Revision', interfaceLogsByMSPO.length);
                }

                var interfaceLogsRevision = interfaceLogsByMSPO.length;



                record.submitFields({
                    type : type,
                    id : rec.id,
                    values : {
                        custrecord_ts2_interface_log_rev : (interfaceLogsRevision > 0 ? interfaceLogsRevision - 1 : 0)
                    }
                });

            }
        }

    }


    return {
        afterSubmit : afterSubmit
    }

});
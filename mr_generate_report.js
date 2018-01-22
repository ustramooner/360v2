/**
 *@NApiVersion 2.x
 *@NScriptType MapReduceScript
 */

define([
        'N/runtime',
        'N/record',
        '../src/lib/interface_log_data',
        '../src/lib/interface_log_validate',
        '../src/lib/interface_log_content',
        '../src/lib/interface_log_savefile'
    ],
    function (
        runtime,
        record,
        data,
        validation,
        content,
        save
    ) {

        function getInputData(){

            var me = runtime.getCurrentScript();
            var interfaces_json = me.getParameter({name:'custscript_interfaces_json'});
            var processInterface = [];

            if(interfaces_json){

                var interfaces = JSON.parse(interfaces_json);
                for(var i = 0; i < interfaces.length; i++){

                    var interface = interfaces[i];

                    var prevInterfaceId = data.getPrevInterfaceLogId(interface.custrecord_ts2_interface_mspo, interface.created);
                    var prevInterface = record.load({
                        type : 'purchaseorder',
                        id : prevInterfaceId
                    });

                    var latestMSPO = JSON.parse(interface.custrecord_ts2_interface_mspo_json);
                    var prevMSPO = prevInterface.getValue('custrecord_ts2_interface_mspo_json');

                    var orderOwner = '';

                    if(interface.custrecord_ts2_interface_blanketpo){
                        var tsBPO = record.load({
                            type : 'customrecord_ts_blanket_po',
                            id : interface.custrecord_ts2_interface_blanketpo
                        });
                        orderOwner = tsBPO.getValue('custrecord_ts2_bpo_order_owner')
                    }

                    processInterface.push({
                        latestMSPO : latestMSPO,
                        prevMSPO : prevMSPO,
                        msPOId : interface.custrecord_ts2_interface_mspo,
                        orderOwner : orderOwner,
                        latestRev : interface.custrecord_ts2_interface_log_rev,
                        prevRev : prevInterface.getValue('custrecord_ts2_interface_log_rev')
                    });

                }
            }

            return processInterface;

        }

        function map(context){

            var result = JSON.parse(context.value);

            var changes = validation.comparemsPO(null, result.latestMSPO, result.prevMSPO, result.interface.custrecord_ts2_interface_mspo);

            var x = {orderOwner : result.orderOwner, latestRev : result.latestRev, prevRev : result.prevRev, changes : changes };

            context.write( result.interface.custrecord_ts2_interface_mspo , JSON.stringify(x));
        }

        function reduce(context){

            var msPO = record.load({
               type : 'purchaseorder',
               id :  context.key
            });

            var result = JSON.parse(context.values[0]);
            var content = content.BuildContent(result.changes, msPO.getValue('trandate'), msPO.getValue('tranid'), result.orderOwner, result.latestRev, result.prevRev );

            content.write(1, content);

        }

        function summarize(summary){

            var fileIds = [];

            summary.output.iterator().each(function(key, value){
                fileIds.push(save.Save('SummaryReport', value));
                return true;
            });

            log.debug('Files', JSON.stringify(fileIds));
        }

        return {
            getInputData : getInputData,
            map : map,
            reduce : reduce,
            summarize : summarize
        }
    }
);
/**
 *@NApiVersion 2.x
 *@NScriptType ScheduledScript
 *@NModuleScope Public
 */

define([
        'N/log',
        'N/runtime',
        'N/record',
        '../src/lib/interface_log_data',
        '../src/lib/interface_log_validate',
        '../src/lib/interface_log_content',
        '../src/lib/interface_log_savefile',
  		'N/email',
  		'N/file'
    ],
    function (log,
              runtime,
              record,
              data,
              validate,
              content,
              save,
              email,
              file) {


        function getDatas(interfaces) {
            

            if (interfaces) {

                //for (var i = 0; i < interfaces.length; i++) {

                    var interface = interfaces;
                    log.debug('Interface', interface);
                    var interfaceLog = record.load({
                        type: 'customrecord_ts2_interface_log',
                        id: interface
                    });

                    var prevInterfaceId = data.getPrevInterfaceLogId(interfaceLog.getValue('custrecord_ts2_interface_mspo'), interfaceLog.getValue('created'));
              
              if(prevInterfaceId){
                    var prevInterface = record.load({
                        type: 'customrecord_ts2_interface_log',
                        id: prevInterfaceId
                    });

                    var latestMSPO = JSON.parse(interfaceLog.getValue('custrecord_ts2_interface_mspo_json'));
                    var prevMSPO = JSON.parse(prevInterface.getValue('custrecord_ts2_interface_mspo_json'));

                    var orderOwner = '';

                    if (interfaceLog.getValue('custrecord_ts2_interface_blanketpo')) {
                        var tsBPO = record.load({
                            type: 'customrecord_ts_blanket_po',
                            id: interfaceLog.getValue('custrecord_ts2_interface_blanketpo')
                        });
                        orderOwner = tsBPO.getValue('custrecord_ts2_bpo_order_owner')
                    }
                    log.debug('Imspo', interfaceLog.getValue('custrecord_ts2_interface_mspo'));

                    return {
                        msPOId: interfaceLog.getValue('custrecord_ts2_interface_mspo'),
                        latestMSPO: latestMSPO,
                        prevMSPO: prevMSPO,
                        orderOwner: orderOwner,
                        latestRev: interfaceLog.getValue('custrecord_ts2_interface_log_rev'),
                        prevRev: prevInterface.getValue('custrecord_ts2_interface_log_rev')
                    };
                
                }

               //}
            }

            return null;
        }

        function processInterface(result) {

            var changes = validate.validateMSPO(null, result.latestMSPO, result.prevMSPO, result.msPOId);
            return {
                orderOwner: result.orderOwner,
                latestRev: result.latestRev,
                prevRev: result.prevRev,
                changes: changes,
                msPOId: result.msPOId
            };
        }

        function buildContent(result) {

            log.debug('Build Content', result.msPOId);
            var rec = record.load({
                type: 'purchaseorder',
                id: result.msPOId
            });
            return content.BuildContent(result.changes, rec.getValue('trandate'), rec.getValue('tranid'), result.orderOwner, result.latestRev, result.prevRev);

        }


        function execute(context) {
            log.debug('Running', 'Running');
            var me = runtime.getCurrentScript();
            var interfaces_json = me.getParameter({name: 'custscript_interfaces_json'});
            var su = me.getParameter({name : 'custscript_interfaces_releases'});
          var x = JSON.parse(interfaces_json);
          var fileIds = [];
log.debug('interfaces_json', interfaces_json);
            for (var i = 0; i < x.length; i++) {

            var datas = getDatas(x[i]);
            log.debug('Datas', JSON.stringify(datas));
if(datas){
                var results = processInterface(datas);
                log.debug('Results', JSON.stringify(results));
                var content = buildContent(results);
                log.debug('Content', content);
                var ids = save.Save('SummaryReport', content);
                log.debug('File Ids', ids);
  fileIds.push(ids);
  }
            }
          
                      var fileObjs = [];

            for(var i = 0; i < fileIds.length; i++){
                fileObjs.push(file.load(fileIds[i]));
            }

            var user = runtime.getCurrentUser();


            log.debug('Summary', su);
          if(!su){
            su = 'No Releases Available';
          }
          
          email.send({
                author : user.id,
                recipients : 'jeff@onepac.net',
                attachments : fileObjs,
                body : su,
                subject : 'Test Interface Summary Report'
            });
          
            log.debug('End', 'End');
        }

        return {
            execute: execute
        }


    });
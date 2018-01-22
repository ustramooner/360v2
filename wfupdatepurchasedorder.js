/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

define(['N/record','N/redirect', 'N/log'],
    function(record, redirect, log) {

        var logResult = function(title, details){
            log.debug({
                title: title,
                details: details
            });
        }

        function onAction(context) {

            var newRecord = context.newRecord;
            var recordId = newRecord.id;

            var purchaseOrderId = newRecord.getValue('custrecord_ts_rspo_po_no');

            if(purchaseOrderId == null || purchaseOrderId == '') throw 'No Release Line Found';

            logResult('Purchase Order ID', purchaseOrderId);


            var returnQty = parseInt(newRecord.getValue('custrecord_ts_asnl_rtn_qty')) || 0;            
          
            var purchaseOrder = record.load({
                type: 'purchaseorder', 
                id: purchaseOrderId,
                isDynamic: false,
            });

            var releaseLineTotalReturnQty = parseInt(purchaseOrder.getValue('custbody_ts2_rlpol_tt_rtn_qty')) || 0;
            //var releaseLineTotalShippedQty = parseInt(purchaseOrder.getValue('custbody_ts2_rlpol_tt_shipped_qty')) || 0;
            //var releaseLineShippableQty = parseInt(purchaseOrder.getValue('custbody_ts2_rlpol_shippable_qty')) || 0;

            logResult('Total Return Qty', releaseLineTotalReturnQty + returnQty);
            //logResult('Total Shipped Qty', releaseLineTotalShippedQty - returnQty);
            //logResult('Total Shippable Qty', releaseLineShippableQty + returnQty);

            

          
            record.submitFields({
                type: 'customrecord_ts_asn_item_details',
                id: recordId,
                values: {
                    custrecord_shipment_po_updated : 'T'
                },
                options: {
                    enableSourcing: false,
                    ignoreMandatoryFields : true
                }
            });

            if(returnQty > 0){

                var releaseHeader = purchaseOrder.getValue('custbody_ts2_rspol_rlpo_no') || 0;
                var blanketPO = purchaseOrder.getValue('custbodyts_rspo_bpo_no') || 0;
                var blanketPOLine = purchaseOrder.getValue('custbody_ts2_rspol_bpol_no') || 0;

                /*record.submitFields({
                    type: 'purchaseorder',
                    id: purchaseOrderId,
                    values : {
                        custbody_ts2_rlpol_tt_rtn_qty : (releaseLineTotalReturnQty + returnQty)
                    }
                });

                record.submitFields({
                    type: 'purchaseorder',
                    id: purchaseOrderId,
                    values : {
                        custbody_ts_rspo_release_status : '2'
                    }
                });*/   

                record.submitFields({
                    type : 'customrecord_ts2_rlpo',
                    id : releaseHeader,
                    values : {
                        custrecord_ts2_rlpo_status : '2'
                    }
                });

                record.submitFields({
                    type : 'customrecord_ts_blanket_po',
                    id : blanketPO,
                    values : {
                        custrecord_ts_bpo_po_status : '2'
                    }
                });

                record.submitFields({
                    type : 'customrecord_ts_blanket_po_line',
                    id : blanketPOLine,
                    values : {
                        custrecord_ts2_bpol_line_status : '2'   
                    }
                });

                
                purchaseOrder.setValue('custbody_ts2_rlpol_tt_rtn_qty', (releaseLineTotalReturnQty + returnQty));
                purchaseOrder.setValue('custbody_ts_rspo_release_status', '2');
                purchaseOrder.save({
                    ignoreMandatoryFields : true
                });


                log.debug('Done','--->');

            }
            
        }
        return {
            onAction: onAction
        }
    });
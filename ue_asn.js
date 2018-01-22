/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
define(['N/search', 'N/log', 'N/record', 'N/redirect', 'N/task',
        '../src/lib/obj_asn_xml_gen', 'N/runtime', '../src/lib/gen_scripts',
        '../src/lib/lib_asn_line'
    ],
    function(search, log, record, redirect, task, asn_xml_gen, runtime, genScripts, libASNLine) {

        var CANCELLED = '3';
        var OPEN = '1';
        var ASNCLOSED = '1';
        var ASNICLOSED = '2';

        var logResult = function(title, details) {
            log.debug({
                title: title,
                details: details
            });
        }

        var filters = function(Id) {
            return [{
                name: 'custrecord_ts_created_fm_asn',
                operator: 'is',
                values: Id
            }]
        }

        var columns = function() {
            return [{
                    name: 'custrecord_ts2_asn_item_status'
                },
                {
                    name: 'custrecord_ts_rspo_po_no'
                },
                {
                    name: 'custrecord_ts_asn_qty'
                },
                {
                    name: 'name'
                }
            ];
        }

        function getASNLineItem(Id) {
            var result = search.create({
                type: 'customrecord_ts_asn_item_details',
                filters: filters(Id),
                columns: columns(),
                title: 'ASN Line Items'
            });

            return result.run().getRange({
                start: 0,
                end: 1000
            });
        }

        function updateASNLineItem(rec, newStatus) {
            var results = getASNLineItem(rec.getValue('id'));
            for (var i = 0; i < results.length; i++) {

                var result = results[i];
                var asnitemstatus = result.getValue('custrecord_ts2_asn_item_status');
                var purchaseOrderId = result.getValue('custrecord_ts_rspo_po_no') || 0;
                var asnLineItemQty = parseInt(result.getValue('custrecord_ts_asn_qty')) || 0;
                if (purchaseOrderId != null && purchaseOrderId != '') {
                    updateASNItem(rec, result, getASNLineItemStatus(newStatus, asnitemstatus), purchaseOrderId, asnLineItemQty);
                }
            }

        }

        function getASNLineItemStatus(newStatus, asnitemstatus) {
            logResult('New Status vs Line Status', newStatus + ' vs ' + asnitemstatus);
            if (newStatus == ASNCLOSED && asnitemstatus == OPEN) {
                return ASNICLOSED;
            } else if (newStatus == ASNCLOSED && asnitemstatus != CANCELLED) {
                return ASNICLOSED;
            } else if (newStatus != ASNCLOSED && newStatus != CANCELLED && asnitemstatus != CANCELLED) {
                return OPEN;
            } else if (newStatus == CANCELLED) {
                return CANCELLED;
            } else {
                return asnitemstatus;
            }
        }

        function updateASNItem(rec, result, status, purchaseOrderId, asnLineItemQty) {
            log.debug('Update ASN Item', status);
            if (status == ASNICLOSED && purchaseOrderId > 0) {
                if(rec.getValue('custrecord_asn_release_qty_updated') == false){
                    purchaseOrder = updateReleasePOLine(purchaseOrderId, asnLineItemQty);
                }
            } else {
                asnLineItemQty = 0;
            }

            var resultId = record.submitFields({
                type: 'customrecord_ts_asn_item_details',
                id: result.id,
                values: {
                    custrecord_ts2_asn_item_status: status,
                    custrecord_ts2_asn_item_orig_shipped_qty: asnLineItemQty
                }
            });
            /*var asnItem = record.load({
                type : 'customrecord_ts_asn_item_details',
                id : result.id
            });
            asnItem.setValue('custrecord_ts2_asn_item_status', status);
            asnItem.setValue('custrecord_ts2_asn_item_orig_shipped_qty', asnLineItemQty);

            asnItem.save({
                ignoreMandatoryFields : true
            });
    */
            logResult('ASN Line Item Update', 'Name: ' + result.getValue('name') + ' ID:' + resultId);

        }

        function updateReleasePOLine(purchaseOrderId, asnLineItemQty) {

            var po = record.load({
                type: 'purchaseorder',
                id: purchaseOrderId,
                isDynamic: true,
            });

            //var releaseLineQty = po.getValue('custbody_ts2_rlpol_tt_shipped_qty') || 0;
        
            var non_inspect_qty = parseInt(po.getValue('custbody_ts2_rlpol_non_inspec_qty')) || 0;
            var tt_acc_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_acc_qty')) || 0;
            var tt_ord_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_ord_qty')) || 0;
            var tt_exp_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_exp_qty')) || 0;

            var tt_rtn_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_rtn_qty')) || 0;

            //var asnLineQty = sumLineQty(lineItems);
            log.debug('asnLineItemQty', asnLineItemQty);
            //var tt_shipped_qty = parseInt(releaseLineQty) + parseInt(asnLineQty); // 

            

            //var releaseLineTotalReturnQty = parseInt(po.getValue('custbody_ts2_rlpol_tt_rtn_qty')) || 0;
            var releaseLineTotalShippedQty = parseInt(po.getValue('custbody_ts2_rlpol_tt_shipped_qty')) || 0;
            var releaseLineShippableQty = parseInt(po.getValue('custbody_ts2_rlpol_shippable_qty')) || 0;
            var qty = parseInt(po.getValue('quantity')) || 0;
            logResult('Quantity', qty);
            po.setValue({
                fieldId: 'quantity',
                value: qty
            });

            releaseLineTotalShippedQty = releaseLineTotalShippedQty + asnLineItemQty; //

            var shippableQty = non_inspect_qty + tt_acc_qty + tt_ord_qty + tt_exp_qty - releaseLineTotalShippedQty + tt_rtn_qty;
            

            po.setValue({
                fieldId: 'custbody_ts2_rlpol_tt_shipped_qty',
                value: releaseLineTotalShippedQty
            });

            po.setValue({
                fieldId : 'custbody_ts2_rlpol_shippable_qty',
                value : (shippableQty)
            });

            po.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });


          
            return po;

        }


        function getASNRecord(context) {
            var c = context.newRecord;

            var asnRecord = record.load({
                type: 'customrecord_ts_asn',
                id: c.id
            });
            return {
                record: asnRecord,
                status: asnRecord.getValue('custrecord_asn_status')
            };
        }

        /*function beforeSubmit(context) {

            if (context.type === context.UserEventType.EDIT) {
                var asnRecord = getASNRecord(context);

                if (asnRecord.status == CANCELLED || asnRecord.status == ASNCLOSED) {
                    updateASNLineItem(getASNLineItem(asnRecord.record.getValue('id')), asnRecord.status);
                } else if (asnRecord.status == '8') {
                    updateASNLineItem(getASNLineItem(asnRecord.record.getValue('id')), asnRecord.status);
                }
            }

        }*/

        function beforeLoad(context) {
            
            if (context.type == context.UserEventType.CREATE) return;

            var asnRecord = getASNRecord(context);
            var userObj = runtime.getCurrentUser();

            if (context.type == context.UserEventType.VIEW) {


                logResult('userobj', userObj);

                var form = context.form;

                if (asnRecord.status == ASNCLOSED) {
                    if (userObj.roleId != 'administrator' && userObj.roleId != 'customrole1096') {
                        form.removeButton({
                            id: 'edit'
                        });
                    }
                }
                var customer = asnRecord.record.getText('custrecord_asn_bill_to_customer');

                logResult('Customer', customer);
                
                var openLineItems = libASNLine.getASNLines_Open(asnRecord.record.id);
                log.debug('Open Items', openLineItems.length)
                //form.clientScriptId = 229274;
                log.debug('OPEN',openLineItems.length);
                if(openLineItems.length < 1){
                    
                    form.removeButton({
                        id: 'custpageworkflow4927'
                    });
                }


            } else if (context.type == context.UserEventType.EDIT) {

                if (asnRecord.status == ASNCLOSED) {
                    if (userObj.roleId != 'administrator' && userObj.roleId != 'customrole1096') {
                        redirect.toRecord({
                            type: 'customrecord_ts_asn',
                            id: asnRecord.record.id,
                            isEditMode: false
                        });
                    }
                }
            }
        }

        function afterSubmit(context) {

            /*var rec = context.newRecord;

      //Teseting
        var asn = record.load({
            type : 'customrecord_ts_asn',
            id : rec.id
        });

        if(asn.getValue('custrecord_asn_status') == '1'){

            
            var customerName = asn.getText('custrecord_asn_bill_to_customer')
            logResult('ASN Customer', customerName);
            if(customerName.toLowerCase().indexOf('merchsource') > -1 || customerName.toLowerCase().indexOf('innovage') > -1){
              logResult('After Submit Action', 'Generating ASN XML File');
                //asn_xml_gen.execute(asn.id);    
            }else{
                logResult('After Submit', 'ASN Record customer is not merch source or innovage');
            }
        }*/
            log.debug('context type', context.type);
            if (context.type === context.UserEventType.EDIT) {



var releaseQtyUpdated = false;
                var asnRecord = getASNRecord(context);
                log.debug('Status', asnRecord.status);
                if (asnRecord.status == CANCELLED || asnRecord.status == ASNCLOSED) {
                    updateASNLineItem(asnRecord.record, asnRecord.status);
                    if(asnRecord.status == ASNCLOSED){
                      releaseQtyUpdated = true;
                    }
                } else if (asnRecord.status == '8') {
                    updateASNLineItem(asnRecord.record, asnRecord.status);
                }

                record.submitFields({
                        type : 'customrecord_ts_asn',
                        id : asnRecord.record.id,
                        values : { custrecord_asn_release_qty_updated : releaseQtyUpdated }
                      });
            }


        }

        return {
            //beforeSubmit : beforeSubmit,
            beforeLoad: beforeLoad,
            afterSubmit: afterSubmit
        };

    });
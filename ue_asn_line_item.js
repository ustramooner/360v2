/**
 * @NApiVersion 2.x 
 * @NScriptType UserEventScript
 */


 define(['N/log', 'N/record', 'N/redirect'], function(log, record, redirect){
 	
 	var CLOSED = '2';

 	var logResult = function(title, details){
 			log.debug({
 				title: title,
 				details: details
 			});
 	}

 	function getASNLineItemRecord(context){
 		var asnLineItemRecord = context.newRecord;
 		return { record : asnLineItemRecord, status : asnLineItemRecord.getValue('custrecord_ts2_asn_item_status')};
 	}

 	function IsNullOrEmpty(val){
 		if(val == "" || val == null){
 			return 0;
 		}
 		return val;
 	}

 	function setRecordToApprove(type, id, field){

 		if( IsNullOrEmpty(id) == 0 ) return;

        var recordObj = record.load({
                    type: type,
                    id: id,
                    isDynamic: true
        });

        var recordObjStatus = recordObj.getValue(field);

        logResult(field, recordObjStatus);

        if(recordObjStatus == '4'){

            recordObj.setValue({
                fieldId: field,
                value: '2'
            })

            recordObj.save({
                    enableSourcing: false,
                    ignoreMandatoryFields: false
            });
        }

    }

    function updateReleasePOLineShipQty(purchaseOrder, asnLineItemQty){

        var releaseLineTotalShippedQty = parseInt(purchaseOrder.getValue('custbody_ts2_rlpol_tt_shipped_qty')) || 0;
        var releaseLineShippableQty = parseInt(purchaseOrder.getValue('custbody_ts2_rlpol_shippable_qty')) || 0;

        releaseLineTotalShippedQty = releaseLineTotalShippedQty + asnLineItemQty;

        purchaseOrder.setValue({
            fieldId : 'custbody_ts2_rlpol_tt_shipped_qty',
            value : releaseLineTotalShippedQty  
        });

        purchaseOrder.setValue({
            fieldId : 'custbody_ts2_rlpol_shippable_qty',
            value : (releaseLineShippableQty - asnLineItemQty)  
        });



        return purchaseOrder;

    }

    function getReleasePOLineStatus(releaseStatus, releaseLineTotalShippedQty, releaseLineQuantity){

		logResult('Total Shipped Qty vs Line Quantity', releaseLineTotalShippedQty + ' vs ' + releaseLineQuantity);

		var result = setRecordStatusToApprove(releaseStatus, releaseLineTotalShippedQty, releaseLineQuantity);

		return result.status;
    }

    function setRecordStatusToApprove(releaseStatus, releaseLineTotalShippedQty, releaseLineQuantity){
    	
    	var ret = { status : '', isApproved : false };
		if (releaseLineTotalShippedQty == releaseLineQuantity) {
			ret.status = '4';
			ret.isApproved = false;			
		}
		else if(releaseStatus == '4'){
			ret.status = '2';
			ret.isApproved = false;
		}
		else{
			ret.status = releaseStatus;
			ret.isApproved = true;
		}
		return ret;
    }


    function updatePurchaseOrder(purchaseOrder, asnLineItemQty){
		
		purchaseOrder = updateReleasePOLineShipQty(purchaseOrder, asnLineItemQty);

    	var releaseStatus = purchaseOrder.getValue('custbody_ts_rspo_release_status');				
    	var releaseLineTotalShippedQty = parseInt(purchaseOrder.getValue('custbody_ts2_rlpol_tt_shipped_qty')) || 0;
		var releaseLineQuantity = parseInt(purchaseOrder.getValue('custbody_ts2_rspol_qty')) || 0;

		purchaseOrder.setValue({
                fieldId : 'custbody_ts_rspo_release_status',
                value : getReleasePOLineStatus(releaseStatus, releaseLineTotalShippedQty, releaseLineQuantity)
        });

      	purchaseOrder.setValue({
        	fieldId : 'custbody_ts2_rspol_qty',
        	value : releaseLineQuantity
        });

        purchaseOrder.save({
            enableSourcing: false,
            ignoreMandatoryFields: false
        });
        
    }

    function updateRecordsToApprove(purchaseOrder){

    	var releaseStatus = purchaseOrder.getValue('custbody_ts_rspo_release_status');				
    	var releaseLineTotalShippedQty = parseInt(purchaseOrder.getValue('custbody_ts2_rlpol_tt_shipped_qty')) || 0;
		var releaseLineQuantity = parseInt(purchaseOrder.getValue('custbody_ts2_rspol_qty')) || 0;


        if (setRecordStatusToApprove(releaseStatus, releaseLineTotalShippedQty, releaseLineQuantity ).isApproved == true){                

        	var releasePOHeaderId = purchaseOrder.getValue('custbody_ts2_rspol_rlpo_no') || 0;
            var blanketPOHeaderId = purchaseOrder.getValue('custbodyts_rspo_bpo_no') || 0;
            var blanketPOLineId = purchaseOrder.getValue('custbody_ts2_rspol_bpol_no') || 0;

            setRecordToApprove('customrecord_ts2_rlpo', releasePOHeaderId, 'custrecord_ts2_rlpo_status');                    
            setRecordToApprove('customrecord_ts_blanket_po', blanketPOHeaderId, 'custrecord_ts_bpo_po_status' );                    
            setRecordToApprove('customrecord_ts_blanket_po_line', blanketPOLineId, 'custrecord_ts2_bpol_line_status' );                                

        }

    }

 	function afterSubmit(context) {

		logResult('Current Context', context.type);

        if (context.type == context.UserEventType.EDIT){

        	var newRecord = context.newRecord;
        	//var oldRecord = context.oldRecord;
            var asnLine = record.load({
                type : 'customrecord_ts_asn_item_details',
                id : newRecord.id
            })
            
        	var purchaseOrderId = asnLine.getValue('custrecord_ts_rspo_po_no') || 0;
            
            var asnLineItemQty = parseInt(asnLine.getValue('custrecord_ts_asn_qty')) || 0;
          
            if(purchaseOrderId == 0) return;

            var purchaseOrder = record.load({
	            type: 'purchaseorder', 
	            id: purchaseOrderId,
	            isDynamic: true,
	        });;


            if(asnLine.getValue('custrecord_ts2_asn_item_status') == CLOSED){
            	
              	updatePurchaseOrder(purchaseOrder, asnLineItemQty);
            	updateRecordsToApprove(purchaseOrder);
            }
            
        }
    }

 	function beforeLoad(context){

 		var asnLineItemRecord = getASNLineItemRecord(context);  		

 		if (context.type == context.UserEventType.VIEW){

 			if(asnLineItemRecord.status == CLOSED){
 				var form = context.form;
 				form.removeButton({id : 'edit'});
 			}
 		}
 	}
 	
 	return {
 		beforeLoad : beforeLoad,
 		afterSubmit : afterSubmit
 	};

 });
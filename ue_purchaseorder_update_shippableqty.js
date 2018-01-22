/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/record','N/log'], 
	function(record, log){

		function afterSubmit(context){

			var p = context.newRecord;

		  	log.debug('LOG',p.id);
          	
          	var po = record.load({
				type : 'purchaseorder',
				id : p.id
			});

          	var non_inspect_qty = parseInt(po.getValue('custbody_ts2_rlpol_non_inspec_qty')) || 0;
log.debug('non inspect', non_inspect_qty);
          var tt_acc_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_acc_qty')) || 0;
          	var tt_ord_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_ord_qty')) || 0;
          	var tt_exp_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_exp_qty')) || 0;
          	var tt_shipped_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_shipped_qty')) || 0;
          	var tt_rtn_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_rtn_qty')) || 0;

          	var shippableQty = non_inspect_qty + tt_acc_qty + tt_ord_qty + tt_exp_qty - tt_shipped_qty + tt_rtn_qty;
log.debug('Shippable Qty', shippableQty);
			po.setValue('custbody_ts2_rlpol_shippable_qty', shippableQty);

			po.save({
				ignoreMandatoryFields : true
			});

		}

		return {
			afterSubmit : afterSubmit
		}
});
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

			var qty = parseInt(po.getValue('custbody_ts2_rspol_qty')) || 0;
			var totalShippedQty = parseInt(po.getValue('custbody_ts2_rlpol_tt_shipped_qty')) || 0;
			var totalReturnQty = parseInt(po.getValue('custbody_ts2_rlpol_tt_rtn_qty')) || 0;

			log.debug('Total Shipped Qty', totalShippedQty);
			log.debug('Total Return Qty', totalReturnQty);
			log.debug('Qty', qty);

			if(totalShippedQty - totalReturnQty === qty){
				log.debug('Updating','---');
				record.submitFields({
					type : 'purchaseorder',
					id : p.id,
					values : {
						custbody_ts_rspo_release_status : '4'
					}
				});
			}

		}

		return {
			afterSubmit : afterSubmit
		}
});
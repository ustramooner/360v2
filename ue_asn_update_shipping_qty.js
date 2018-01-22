/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

define(['N/record', 'N/log', 'N/search'], function(record, log, search){

	function findIndex(objArray, prop, value) {
        for (var i = 0; i < objArray.length; i++) {
            if (objArray[i][prop] == value) return i;
        }
        return -1;
    }


	function getReleaseLineIitems(asnId){
		var pos = [];
		var lineItems = search.create({
			type : 'customrecord_ts_asn_item_details',
			filters : [{
				name : 'custrecord_ts2_asn_item_status',
				operator : search.Operator.NONEOF,
				values : ['3']
			},{
				name : 'custrecord_ts_created_fm_asn',
				operator : search.Operator.IS,
				values : [asnId]
			}],
			columns : ['custrecord_ts_rspo_po_no', 'custrecord_ts_asn_qty'],
			title : 'Get ASN Lines'
		});
		lineItems.run().each(function(result){
			var poIndex = findIndex(pos, 'po', result.getValue('custrecord_ts_rspo_po_no'));
			if(poIndex < 0){
				pos.push({
					po : result.getValue('custrecord_ts_rspo_po_no'),
					qty : result.getValue('custrecord_ts_asn_qty')
				});
			}else{
				pos[poIndex].qty = parseInt(pos[poIndex].qty) + parseInt(result.getValue('custrecord_ts_asn_qty'));
			}
			return true;
		});
		return pos;
	}

	function getASNLineIitemsPerPO(asnId, poId){
		var lineItems = search.create({
			type : 'customrecord_ts_asn_item_details',
			filters : [{
				name : 'custrecord_ts2_asn_item_status',
				operator : search.Operator.NONEOF,
				values : ['3']
			},{
				name : 'custrecord_ts_rspo_po_no',
				operator : search.Operator.IS,
				values : [poId]
			}],
			columns : ['custrecord_ts_rspo_po_no', 'custrecord_ts_asn_qty'],
			title : 'Get ASN Lines'
		});
		return lineItems.run().getRange(0,1000);
	}

	function afterSubmit(context){
return;

		var rec = context.newRecord;
		var asn = record.load({
			type : 'customrecord_ts_asn',
			id : rec.id
		});
		log.debug('Status', asn.getValue('custrecord_asn_status'));
		if(asn.getValue('custrecord_asn_status') == '1'){

			var needChecking = asn.getValue('custrecord_ts2_asn_run_asn_checking') || false;
			if (!needChecking)
                return;

			var lineItems = getReleaseLineIitems(rec.id);
			
			if(lineItems){

				var results = lineItems;//.getRange(0,1000);
				
				for(var i = 0; i < results.length; i++){
					var result = results[i];
					var asnLineQty = result.qty;
					var releaseLine = result.po;

					if(releaseLine){
						//var sum =sumLineQty(rec.id, releaseLine);
						updateShippingQty(releaseLine, asnLineQty);
					}
				}

		
              
            }
          
        record.submitFields({
                type: 'customrecord_ts_asn',
                id: rec.id,
                values: {
                    custrecord_ts2_asn_run_asn_checking: false
                },
                options: {
                    ignoreMandatoryFields: true
                }
            });  



		}
	}

	function getSimilarPO(lineItems, poId){
		var pos = [];
		for(var i = 0; i < lineItems.length; i++){
			if(lineItems[i].id == poId){
				pos.push(lineItems[i].getValue('custrecord_ts_rspo_po_no'));
			}
		}
		return pos;
	}

	function sumLineQty(asnId, po){
		var lineItems = getASNLineIitemsPerPO(asnId, po);
		var sum = 0;
		for(var i = 0; i < lineItems.length; i++){
			sum += parseInt(lineItems[i].getValue('custrecord_ts_asn_qty'));
		}
		return sum;
	}

	function updateShippingQty(releaseLine, asnLineQty){

		log.debug('Release Line ID vs asnLineQty', releaseLine + ' vs ' + asnLineQty);

		var po = record.load({
			type : 'purchaseorder',
			id : releaseLine
		});
      
      if(po.getValue('custbody_ts_rspo_release_status') != '4') return;
	
      log.debug('Release Line Status', po.getValue('custbody_ts_rspo_release_status'));
		var releaseLineQty = po.getValue('custbody_ts2_rlpol_tt_shipped_qty') || 0;
		
		var non_inspect_qty = parseInt(po.getValue('custbody_ts2_rlpol_non_inspec_qty')) || 0;
      	var tt_acc_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_acc_qty')) || 0;
      	var tt_ord_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_ord_qty')) || 0;
      	var tt_exp_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_exp_qty')) || 0;

      	var tt_rtn_qty = parseInt(po.getValue('custbody_ts2_rlpol_tt_rtn_qty')) || 0;

      	//var asnLineQty = sumLineQty(lineItems);
      	log.debug('asnLineQty', asnLineQty);
      	var tt_shipped_qty = parseInt(releaseLineQty) + parseInt(asnLineQty); // 

      	var shippableQty = non_inspect_qty + tt_acc_qty + tt_ord_qty + tt_exp_qty - tt_shipped_qty + tt_rtn_qty;
		
		po.setValue('custbody_ts2_rlpol_tt_shipped_qty', tt_shipped_qty);
		po.setValue('custbody_ts2_rlpol_shippable_qty', shippableQty);
		
		po.save({			
            ignoreMandatoryFields: true
		});
	}

	return {
		afterSubmit : afterSubmit
	}


});
var LOG_NAME = 'afterSubmit_onSave';

var CUST_BILLING_TYPE_AGENCY = 1;
// "Agency"
var CUST_BILLING_TYPE_PRINCIPAL = 2;
// "Principal"
var CUST_BILLING_TYPE_TRADING = 3;
// "Trading"

var SCRIPT_SINGLE_PO_ID = 'customscript_asn_single_po';
// TS730
var SCRIPT_COMP_PO_LOCAL_BILL_PER_DEL = 'customscript_comp_local_bill_dlvry';
// TS740
var SCRIPT_COMP_PO_FINAL_BILL_PER_DEL = 'customscript_comp_final_bill_dlvry';
// TS750
var SCRIPT_COMP_PO_LOCAL_BILL_PER_FINAL = 'customscript_comp_local_bill_per_final';
// TS760
var SCRIPT_COMP_PO_FINAL_BILL_PER_FINAL = 'customscript_comp_final_bill_per_final';

var COMPOSITE_TYPE_BILL_PER_DELIVERY = 1;
var COMPOSITE_TYPE_BILL_PER_FINAL = 2;


function getLineItem(asnId){
	return nlapiSearchRecord('customrecord_ts_asn_item_details',null,[new nlobjSearchFilter('custrecord_ts_created_fm_asn',null,'is',asnId)]);
}

/**
 * 
 * @param type
 */
function afterSubmit_onSave(type) {

	dLog(LOG_NAME, 'type = ' + type);
	if (type != 'edit' && type != 'xedit')
		return;

	var recId = nlapiGetRecordId();
	dLog(LOG_NAME, 'Processing ASN |  id = ' + recId);

	var rec = nlapiLoadRecord('customrecord_ts_asn', recId);

	var columns = [ new nlobjSearchColumn('custrecord_asn_reset') ];
	var rs = nlapiSearchRecord('customrecord_ts_asn', SAVED_SEARCH_ASN, new nlobjSearchFilter('internalid', null, 'anyOf', recId), columns);
	if (rs == null) {
		dLog(LOG_NAME, 'ONE0909: Result Set is empty. Set to ERROR.');
		rec.setFieldValue('custrecord_asn_reset', 'F');
		rec.setFieldValue('custrecord_asn_status', ASN_STAT_ERROR);

		// updated ASN record
		nlapiSubmitRecord(rec, true, true);
		return;
	}
  var asnReset = rs[0].getValue('custrecord_asn_reset');
dLog(LOG_NAME, 'ASN Reset from Load Record = ' + rec.getFieldValue('custrecord_asn_reset'));
	dLog(LOG_NAME, 'ASN Reset = ' + asnReset);
	if (asnReset == 'F') {
		dLog(LOG_NAME, 'Reset is not checked. Exit script.');
		return;
	}

  
  
	var asnStatus = rs[0].getValue('custrecord_asn_status');
if (asnStatus == ASN_STAT_ERROR){
		dLog(LOG_NAME, 'ASN Status is ERROR. Exit script.');
		return;
	}





	// Determine Customer Billing Type
	var custId = rs[0].getValue('custrecord_asn_bill_to_customer');

	if (isEmpty(custId)) {

		dLog(LOG_NAME, 'No customer in the record. Exit script!');
	
		rec.setFieldValue('custrecord_asn_reset', 'F');
		rec.setFieldValue('custrecord_asn_status', ASN_STAT_ERROR);

		// updated ASN record
		nlapiSubmitRecord(rec, true, true);
		return;
	}

	var custBillingType = nlapiLookupField('customer', custId, 'custentity_ts_customer_billing_type');

	dLog(LOG_NAME, 'Customer Id = ' + custId);
	dLog(LOG_NAME, 'Customer Billing Type = ' + custBillingType);

	// get Blanket PO of first ASN line
	var asnlineid = 0;
  var blanketPO;
	var asnline = getLineItem(recId);
	if(asnline && asnline.length > 0){
		asnlineid = asnline[0].id;//rec.getLineItemValue('recmachcustrecord_ts_created_fm_asn','id',1);
      blanketPO = nlapiLookupField('customrecord_ts_asn_item_details', asnlineid, 'custrecord_ts_asn_bpo_line_no');
	}else{
      dLog(LOG_NAME, 'Found No Line Item');
    }
    
	

	dLog(LOG_NAME, 'Blanket PO | Id = ' + blanketPO);

	// Determining ASN PO Type
	if (!isEmpty(blanketPO)) {

		var status = '';
		var objBPO = getBlanketPOInfo(blanketPO);
		var compositeNo = (objBPO) ? objBPO[0].getValue('custrecord_ts_bpo_composite_no') : '';
		var deliveryToPONum = (objBPO) ? objBPO[0].getValue('custrecord_ts2_bpo_del_to_po') : '';

		dLog(LOG_NAME, 'Composite No = ' + compositeNo);
		dLog(LOG_NAME, 'Delivery to PO Number = ' + deliveryToPONum);

		// If Composite Number field is empty, then that means it's a Single PO
		if (isEmpty(compositeNo)) {

			// calling single po scheduled script
			dAudit(LOG_NAME, 'Calling TS.20 scheduled script..');
			status = nlapiScheduleScript(SCRIPT_SINGLE_PO_ID, null, {
				custscript_acp_asn_id : recId
			});

		} else {

			// If Composite Number field is not empty, then it is a Composite
			// PO.
			// Determine Composite Type is on the Customer record. There are two
			// values selectable for the Composite Type list field

			var compositeType = nlapiLookupField('customer', custId, 'custentity_ts_customer_composite_type');
			dLog(LOG_NAME, 'Composite Type = ' + compositeType);

			if (compositeType == COMPOSITE_TYPE_BILL_PER_DELIVERY) {

				// Bill per Delivery
				// On the TS Blanket Purchase Order record:

				// if the Delivery to PO Number is empty, then the vendor type
				// is Final Vendor
				if (isEmpty(deliveryToPONum)) {

					dAudit(LOG_NAME, 'Calling TS.40 scheduled script..');
					status = nlapiScheduleScript(SCRIPT_COMP_PO_FINAL_BILL_PER_DEL, null, {
						custscript_compositepo_t40_asn_id : recId
					});

				} else {

					// If the Delivery to PO Number is not empty, then the
					// vendor
					// type is Local Vendor
					dAudit(LOG_NAME, 'Calling TS.30 scheduled script..');
					status = nlapiScheduleScript(SCRIPT_COMP_PO_LOCAL_BILL_PER_DEL, null, {
						custscript_compositepo_t30_asn_id : recId
					});
				}

			} else if (compositeType == COMPOSITE_TYPE_BILL_PER_FINAL) {

				// Bill per Final
				if (isEmpty(deliveryToPONum)) {

					dAudit(LOG_NAME, 'Calling TS.60 scheduled script..');
					status = nlapiScheduleScript(SCRIPT_COMP_PO_FINAL_BILL_PER_FINAL, null, {
						custscript_compositepo_t60_asn_id : recId
					});

				} else {

					// If the Delivery to PO Number is not empty, then the
					// vendor
					// type is Local Vendor

					dAudit(LOG_NAME, 'Calling TS.50 scheduled script..');
					status = nlapiScheduleScript(SCRIPT_COMP_PO_LOCAL_BILL_PER_FINAL, null, {
						custscript_compositepo_t50_asn_id : recId
					});
				}
			}

			dLog(LOG_NAME, 'Sched Status = ' + status);
		}
	} else {
		dLog(LOG_NAME, 'ONE0909-2: Blanket PO is empty. Set to ERROR.');
		rec.setFieldValue('custrecord_asn_reset', 'F');
		rec.setFieldValue('custrecord_asn_status', ASN_STAT_ERROR);

		// updated ASN record
		nlapiSubmitRecord(rec, true, true);
	}
}

function getBlanketPOInfo(bpoId) {
	var filters = [ new nlobjSearchFilter('internalid', null, 'is', bpoId) ];
	var columns = [ new nlobjSearchColumn('custrecord_ts_bpo_composite_no'), new nlobjSearchColumn('custrecord_ts2_bpo_del_to_po') ];

	return nlapiSearchRecord('customrecord_ts_blanket_po', null, filters, columns);
}

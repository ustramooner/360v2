var LOG_NAME = 'schedProcessCompositePO';

var arrPOMap = [];

/**
 * 
 * @param rec
 */
function schedProcessCompositePO() {

	var paramSNId = nlapiGetContext().getSetting('SCRIPT', 'custscript_compositepo_t50_asn_id');
	dLog(LOG_NAME, 'paramSNId = ' + paramSNId);

	var rec = nlapiLoadRecord('customrecord_ts_asn', paramSNId);
	
	// Added by Herman for Batch Control
	batchcontrol_update(rec);

	// loop through ASN line
	var lineCtr = rec.getLineItemCount(ASN_SUBLISTID);
	var arrPO = [];
	var rs = nlapiSearchRecord('customrecord_ts_asn', SAVED_SEARCH_ASN, new nlobjSearchFilter('internalid', null, 'anyOf', paramSNId));

	if (rs == null) {
		dLog(LOG_NAME, 'No ASN to process. Exit script.');
		return;
	}

	var custId = rs[0].getValue('custrecord_asn_bill_to_customer');
	dLog(LOG_NAME, 'custId = ' + custId);

	// Determine Customer Billing Type
	var custBillingType = nlapiLookupField('customer', custId, 'custentity_ts_customer_billing_type');
	dLog(LOG_NAME, 'Customer Billing Type = ' + custBillingType);

	var arrPOASNMap = [];

	for (var i = 0; i < rs.length; i++) {

		var item = rs[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var releaseShipmentPO = rs[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var asnLine = rs[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var blanketPO = rs[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
		var custPONo = rs[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');

		arrPO.push(releaseShipmentPO);

		arrPOASNMap[releaseShipmentPO] = {
			asnline : asnLine,
			bpoline : blanketPO,
			shipmentpo : releaseShipmentPO,
			custpono : custPONo
		};
	}

	arrPO = removeDuplicates(arrPO);

	if (custBillingType == CUST_BILLING_TYPE_AGENCY) {

		var arrIRId = receiptPO(arrPO, paramSNId, true);

		if (arrIRId.length > 0) {
			closePO(arrPO);

			rec.setFieldValue('custrecord_asn_reset', 'F');

			// updated ASN record
			nlapiSubmitRecord(rec, true, true);
		}
	} else {

		var billId = transformPOToBill(arrPO, rec, arrPOASNMap, rs);

		if (billId) {

			closePO(arrPO);

			rec.setFieldValue('custrecord_asn_vendor_bill_no', billId);
			rec.setFieldValue('custrecord_asn_reset', 'F');

			// updated ASN record
			nlapiSubmitRecord(rec, true, true);
		}
	}
}
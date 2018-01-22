/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       08 Jul 2016     yonghyk
 *
 */

/**
 * @returns {Void} Any or no return value
 */
function HermanTestLocalBillperFinal() {
	var LOG_NAME = 'schedProcessCompositePO';


	var paramSNId = '13339';
	dLog(LOG_NAME, 'paramSNId = ' + paramSNId);

	var rec = nlapiLoadRecord('customrecord_ts_asn', paramSNId);

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
	var billId = transformHYPOToBill(arrPO, rec, arrPOASNMap, rs);


	if (billId) {

		closePO(arrPO);

		rec.setFieldValue('custrecord_asn_vendor_bill_no', billId);
		rec.setFieldValue('custrecord_asn_reset', 'F');

		// updated ASN record
		nlapiSubmitRecord(rec, true, true);
	}

}



function transformHYPOToBill(arrPO, recASN, arrMap) {

    dLog('transformPOToBill', '>>>>>>>>>>>>>>>');

    var asnSupplier = recASN.getFieldValue('custrecord_ts_asn_supplier');
    var asnOrigDoRcvdDate = recASN.getFieldValue('custrecord_ts_asn_org_doc_rec_dd');
    var asnOnboardDate =recASN.getFieldValue('custrecord_asn_actual_onboard_dd');
    var objVendor = !isEmpty(asnSupplier) ? nlapiLookupField('vendor', asnSupplier, ['terms', 'custentity_ts_vendor_pyt_method']) : '';
    var supplierTermDays = !isEmpty(objVendor.terms) ? getTermDays(objVendor.terms) : 0;
    var dueDate = asnOrigDoRcvdDate;
    var today = nlapiDateToString( new Date() );;

    if (!isEmpty(asnOrigDoRcvdDate) && !isEmpty(supplierTermDays)) {

        dueDate = nlapiDateToString(nlapiAddDays(nlapiStringToDate(asnOrigDoRcvdDate), supplierTermDays));
    }

    dLog('transformPOToBill', 'asnSupplier = ' + asnSupplier);
    dLog('transformPOToBill', 'asnOrigDoRcvdDate = ' + asnOrigDoRcvdDate);
    dLog('transformPOToBill', 'Supplier Terms = ' + objVendor.terms);
    dLog('transformPOToBill', 'supplierTermDays = ' + supplierTermDays);
    dLog('transformPOToBill', 'dueDate = ' + dueDate);

    try {

        // Transform PO into Vendor Bill
        // var recBill = nlapiCreateRecord('vendorbill', {
        // recordmode : 'dynamic',
        // entity : asnSupplier
        // });

        var recBill = nlapiCreateRecord('vendorbill');
        recBill.setFieldValue('entity', asnSupplier);
        recBill.setFieldValue('tranid', recASN.getFieldValue('custrecord_asn_supplier_inv_num'));

        // Original Doc Received Date = 'custrecord_asn_supplier_inv_dd'
        // from ASN record.

        if (!isEmpty(asnOrigDoRcvdDate)) {
        	
            if (periodClosed(asnOrigDoRcvdDate)== 'T'){
            	recBill.setFieldValue('trandate', today);
            }
            else {
            	recBill.setFieldValue('trandate', asnOrigDoRcvdDate);
            }
            recBill.setFieldValue('custbody_ts_ap_org_doc_rcpt_dd', asnOrigDoRcvdDate);
            recBill.setFieldValue('custbody_ts_ap_pyt_method', objVendor.custentity_ts_vendor_pyt_method);
        }
        else {
            if (periodClosed(asnOnboardDate)== 'T'){
            	recBill.setFieldValue('trandate', today);
            }
            else {
                recBill.setFieldValue('trandate', asnOnboardDate);
            }

            // Place bill on hold
            recBill.setFieldValue('custbody_ts_ap_pyt_method', PAYMENT_METHOD_DOCUMENT_PENDING);
        }

        // Due Date 'duedate' = Original Doc Received Date + Payment Terms.
        recBill.setFieldValue('duedate', dueDate);
        
        recBill.setFieldValue('location',LOC_THREESIXTY);

        // Posting Period 'postingperiod' = Current Period.
        recBill.setFieldText('postingperiod', getPostingDate());
        recBill.setFieldValue('memo', SCRIPT_TEST_NOTES);

        recBill.setFieldValue('custbody_ts_rspo_related_asn', recASN.getId());

        var rsPO = getPOLines(arrPO);

        if (rsPO != null) {

            for (var i = 0; i < rsPO.length; i++) {

                var poId = rsPO[i].getValue('internalid', null, 'group');
                var serialNumbers = arrMap[poId].custpono;
                var qty = rsPO[i].getValue('quantity', null, 'max');

                dLog('transformPOToBill', 'serialNumbers = ' + serialNumbers);
                dLog('transformPOToBill', 'qty = ' + qty);

                recBill.selectNewLineItem('item');
                recBill.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', arrMap[poId].asnline);
                // recBill.setCurrentLineItemValue('item',
                // 'custcol_ts_ap_ar_bpol', rsPO[i].getValue('item'));
                // recBill.setCurrentLineItemValue('item',
                // 'custcol_ts_ap_ar_rspo_no', rsPO[i].getValue('item'));

                recBill.setCurrentLineItemValue('item', 'item', rsPO[i].getValue('item', null, 'group'));
                recBill.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
                recBill.setCurrentLineItemValue('item', 'quantity', rsPO[i].getValue('quantity', null, 'max'));
                recBill.setCurrentLineItemValue('item', 'rate', rsPO[i].getValue('rate', null, 'max'));

                if (!isEmpty(serialNumbers))
                    recBill.setCurrentLineItemValue('item', 'serialnumbers', serialNumbers + '(' + qty + ')');

                recBill.commitLineItem('item');
            }

        }
        else {
            dLog('transformPOToBill', 'NO PO lines found.');
        }

        var id = nlapiSubmitRecord(recBill, true, true);
        
        
        dAudit('transformPOToBill', 'Created Bill | id = ' + id);

        return id;
    }
    catch (e) {

        var stErrMsg = '';
        if (e.getDetails !== undefined) {
            stErrMsg = 'Transform PO>Bill Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
        }
        else {
            stErrMsg = 'Transform PO>Bill Error: ' + e.toString();
        }

        dLog('Transform PO>Bill Error', stErrMsg);
    }
}






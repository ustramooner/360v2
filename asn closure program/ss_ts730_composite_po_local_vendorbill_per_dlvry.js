var LOG_NAME = 'schedProcessCompositePO';

var arrPOMap = [];

/**
 * 
 * @param rec
 */
function schedProcessCompositePO() {

	var paramSNId = nlapiGetContext().getSetting('SCRIPT', 'custscript_compositepo_t30_asn_id');
	dLog(LOG_NAME, 'paramSNId = ' + paramSNId);

	var arrPO = [];
	var rec = nlapiLoadRecord('customrecord_ts_asn', paramSNId);
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
	var invJob = '';

	for (var i = 0; i < rs.length; i++) {

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

		if (!isEmpty(custPONo))
			invJob = custPONo;
	}

	arrPO = removeDuplicates(arrPO);

	if (custBillingType == CUST_BILLING_TYPE_AGENCY) {

		var arrIRId = receiptPO(arrPO, paramSNId, true);

		if (arrIRId.length > 0) {

			var isCloseOk = closePO(arrPO);

			if (isCloseOk) {

				var soId = createCompositeAgencyOrder(rs, paramSNId);

				if (!isEmpty(soId)) {

					var invId = transformToInvoice(soId, paramSNId, '', rec, invJob, rs);
					rec.setFieldValue('custrecord_ts_asn_customer_inv_no', invId);
					rec.setFieldValue('custrecord_asn_reset', 'F');

					// updated ASN record
					nlapiSubmitRecord(rec, true, true);
				}
			}
		}
	} else {

		// As per Herman on 26 Jun 2016: comment out po receipt for principal
		// and trading
		// var arrIR = receiptPO(arrPO, paramSNId, false);

		// if (arrIR.length > 0) {
		var billId = transformPOToBill(arrPO, rec, arrPOASNMap, rs);

		if (billId) {

			closePO(arrPO);

			var soId = '';

			if (custBillingType == CUST_BILLING_TYPE_PRINCIPAL) {

				soId = createCompositePrincipalOrder(rs, paramSNId);

			} else if (custBillingType == CUST_BILLING_TYPE_TRADING) {

				soId = createCompositeTradingOrder(rs, paramSNId);
			}

			if (!isEmpty(soId)) {

				var invId = transformToInvoice(soId, paramSNId, billId, rec, invJob, rs);
				rec.setFieldValue('custrecord_asn_vendor_bill_no', billId);
				rec.setFieldValue('custrecord_ts_asn_customer_inv_no', invId);
				rec.setFieldValue('custrecord_asn_reset', 'F');

				// updated ASN record
				nlapiSubmitRecord(rec, true, true);
			}
		}

		// }
	}
}

/**
 * 
 */
function createCompositeAgencyOrder(objRS, asnId) {

	try {
		dLog('createAddSOItem', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('memo', SCRIPT_TEST_NOTES);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));

		// Blanket PO Ids
		var arrBPOId = [];
		// Blanket PO Line Ids
		var arrBPOLineId = [];
		// Release Shipment PO Ids
		var arrRSPOId = [];

		// Item ids
		var arrItemId = [];

		for (var ix = 0; ix < objRS.length; ix++) {

			var item = objRS[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');

			if (!isEmpty(blanketPOId))
				arrBPOId.push(blanketPOId);

			if (!isEmpty(blanketPOLineId))
				arrBPOLineId.push(blanketPOLineId);

			if (!isEmpty(releaseShipmentPO))
				arrRSPOId.push(releaseShipmentPO);

			if (!isEmpty(item))
				arrItemId.push(item);
		}

		var arrBPOMap = getAddlCharges(arrBPOLineId);
		var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
		var arrBPOInfo = getBlanketPOInfo(arrBPOId);
		var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);
		var arrItemType = getItemType(arrItemId);

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = objRS[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var customerItemNo = nlapiLookupField('item', item, 'custitem_ts_item_customer_item_no');
			var itemTxt = objRS[i].getText('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var subTotal = 0;

			dLog('createAddSOItem', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('createAddSOItem', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

			if (arrItemType[item] == 'OthCharge') {

				// OTHER CHARGE ITEM
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_item_name', itemTxt);

				if (!isEmpty(compositeItem))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);

				if (!isEmpty(arrContainerMap[asnLine]))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

				if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
					setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

				rec.setCurrentLineItemValue('item', 'item', item);
				rec.setCurrentLineItemValue('item', 'quantity', itemQty);
				rec.setCurrentLineItemValue('item', 'price', -1);
				rec.setCurrentLineItemValue('item', 'rate', itemRate);
				// rec.setCurrentLineItemValue('item', 'amount',
				// itemQty*itemRate);
				rec.commitLineItem('item');

				dLog('createAddSOItem', 'Set Other Charge line..');

				subTotal += getFloatVal(itemRate) * getIntVal(itemQty);

				// subtotal
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'item', ITEM_SUBTOTAL);
				rec.setCurrentLineItemValue('item', 'amount', subTotal);
				rec.commitLineItem('item');
			} else {
				// AGENCY ITEM LINE
				var amtAgency = getFloatVal(itemRate) * getIntVal(itemQty);
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
				rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
				rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_item_name', itemTxt);

				if (!isEmpty(compositeItem))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);

				if (!isEmpty(arrContainerMap[asnLine]))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

				if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
					setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

				rec.setCurrentLineItemValue('item', 'item', ITEM_AGENCY);
				rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo);
				rec.setCurrentLineItemValue('item', 'quantity', itemQty);
				rec.setCurrentLineItemValue('item', 'price', -1);
				rec.setCurrentLineItemValue('item', 'rate', itemRate);
				rec.setCurrentLineItemValue('item', 'amount', amtAgency);
				rec.commitLineItem('item');

				dLog('createAddSOItem', 'Set Agency line..');

				subTotal += amtAgency;

				if (!isEmpty(arrBPOMap[blanketPOLine])) {
					subTotal = setAddlCharge(rec, arrBPOMap[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, compositeItem);
				}

				// GROSS MARGIN LINE
				if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
					rec.selectNewLineItem('item');
					rec.setCurrentLineItemValue('item', 'item', ITEM_GROSSMARGIN);
					rec.setCurrentLineItemValue('item', 'rate', arrBPOLineInfo[blanketPOLine].grossmargin);

					if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
						setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

					subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));

					if (!isEmpty(compositeItem))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
					rec.commitLineItem('item');

					dLog('createAddSOItem', 'Set Gross Margin line..');

					setSubTotal(rec, subTotal);
				}

				// OFFSET ITEM LINE
				var amtOffSet = amtAgency * -1;
				subTotal += amtOffSet;
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'item', ITEM_OFFSET);
				rec.setCurrentLineItemValue('item', 'quantity', itemQty);
				rec.setCurrentLineItemValue('item', 'amount', amtOffSet);
				if (!isEmpty(compositeItem))
					rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);
				rec.commitLineItem('item');

				dLog('createAddSOItem', 'Set Offset line..');

				// subtotal
				setSubTotal(rec, subTotal);
			}
		}

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('createAddSOItem', 'Created Sales Order | id = ' + id);
		return id;
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'SO Creation Error: ' + e.toString();
		}

		dLog('SO Creation Error', stErrMsg);

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		return null;
	}
}

function createCompositePrincipalOrder(objRS, asnId) {
	try {
		dLog('createCompositePrincipalOrder', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('memo', SCRIPT_TEST_NOTES);
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));

		// Blanket PO Ids
		var arrBPOId = [];
		// Blanket PO Line Ids
		var arrBPOLineId = [];
		// Release Shipment PO Ids
		var arrRSPOId = [];
		// Item Ids
		var arrItemId = [];
		for (var ix = 0; ix < objRS.length; ix++) {

			var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');

			if (!isEmpty(blanketPOId))
				arrBPOId.push(blanketPOId);

			if (!isEmpty(blanketPOLineId))
				arrBPOLineId.push(blanketPOLineId);

			if (!isEmpty(releaseShipmentPO))
				arrRSPOId.push(releaseShipmentPO);

			if (!isEmpty(item))
				arrItemId.push(item);
		}

		var arrBPOMap = getAddlCharges(arrBPOLineId);
		var arrBPOInfo = getBlanketPOInfo(arrBPOId);
		var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
		var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);
		var arrItemLotMap = checkItemLot(arrItemId);

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = objRS[i].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var customerItemNo = nlapiLookupField('item', item, 'custitem_ts_item_customer_item_no');
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var subTotal = 0;
			var asnAmt = 0;

			dLog('createCompositePrincipalOrder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('createCompositePrincipalOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

			// asn line item
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);

			if (!isEmpty(compositeItem))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_composite_item', compositeItem);

			if (!isEmpty(arrContainerMap[asnLine]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

			rec.setCurrentLineItemValue('item', 'item', item);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo);
			rec.setCurrentLineItemValue('item', 'quantity', itemQty);
			rec.setCurrentLineItemValue('item', 'price', -1);
			rec.setCurrentLineItemValue('item', 'rate', itemRate);

			if (arrItemLotMap[item] == 'T') {

				dLog('createCompositePrincipalOrder', 'setting sublist @ line ' + i + 'is Lot item | ' + arrItemLotMap[item] + ' | item id : ' + item + ' | Serial No. : ' + custPONo + ' | Qty : '
						+ itemQty);

				var serialLotNum = custPONo + '(' + itemQty + ')';
				dLog('createCompositePrincipalOrder', 'serialLotNum = ' + serialLotNum);

				rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
			}

			if (!isEmpty(arrBPOLineInfo[blanketPOLine]))
				setTransCols(rec, arrBPOLineInfo[blanketPOLine]);

			asnAmt = rec.getCurrentLineItemValue('item', 'amount');

			rec.commitLineItem('item');

			dLog('createCompositePrincipalOrder', 'Set asn line item..');

			subTotal += getFloatVal(asnAmt);

			if (!isEmpty(arrBPOMap[blanketPOLine])) {
				subTotal = setAddlCharge(rec, arrBPOMap[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, compositeItem);
			}

			// gross margin
			if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'item', ITEM_GROSSMARGIN);
				rec.setCurrentLineItemValue('item', 'rate', arrBPOLineInfo[blanketPOLine].grossmargin);

				if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

					if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', arrBPOLineInfo[blanketPOLine].grossmargin);
				}

				subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));

				rec.commitLineItem('item');

				dLog('createCompositePrincipalOrder', 'Set Gross Margin line..');

				setSubTotal(rec, subTotal);
			}
		}

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('createPrincipalOrder', 'Created Sales Order | id = ' + id);
		return id;
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'SO Creation Error: ' + e.toString();
		}

		dLog('SO Creation Error', stErrMsg);

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		return null;
	}
}

function createCompositeTradingOrder(objRS, asnId) {
	try {
		dLog('createCompositeTradingOrder', '>>>>>>>>>>>>>>>');

		var rec = initSORec(objRS);

		rec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		rec.setFieldValue('memo', SCRIPT_TEST_NOTES);
		// rec.setFieldValue('custbody_ts_transaction_upload_batch',
		// objRS[0].getValue('custrecord_ts_asn_batch_code'));
		rec.setFieldValue('custbody_asn_batch_code', objRS[0].getValue('custrecord_ts_asn_batch_code'));

		// Blanket PO Ids
		var arrBPOId = [];
		// Blanket PO Line Ids
		var arrBPOLineId = [];
		// Release Shipment PO Ids
		var arrRSPOId = [];
		// Item Ids
		var arrItemId = [];
		for (var ix = 0; ix < objRS.length; ix++) {

			var blanketPOId = objRS[ix].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLineId = objRS[ix].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[ix].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var item = objRS[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');

			if (!isEmpty(blanketPOId))
				arrBPOId.push(blanketPOId);

			if (!isEmpty(blanketPOLineId))
				arrBPOLineId.push(blanketPOLineId);

			if (!isEmpty(releaseShipmentPO))
				arrRSPOId.push(releaseShipmentPO);

			if (!isEmpty(item))
				arrItemId.push(item);
		}

		var arrBPOMap = getAddlCharges(arrBPOLineId);
		var arrBPOInfo = getBlanketPOInfo(arrBPOId);
		var arrBPOLineInfo = getBlanketPOLineInfo(arrBPOLineId);
		var arrRSPOMapInfo = getPOIncoterm(arrRSPOId);
		var arrItemLotMap = checkItemLot(arrItemId);

		for (var i = 0; i < objRS.length; i++) {

			var blanketPO = objRS[i].getValue('custrecord_ts_asn_bpo_line_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var blanketPOLine = objRS[i].getValue('custrecord_ts_asn_bpol_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var custPONo = objRS[i].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var asnLine = objRS[i].getValue('internalid', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemRate = objRS[i].getValue('custrecord_ts_asn_item_rate', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemId = objRS[i].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var customerItemNo = nlapiLookupField('item', itemId, 'custitem_ts_item_customer_item_no');
			var itemQty = objRS[i].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemUnit = objRS[i].getValue('custrecord_ts_asn_unit', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var releaseShipmentPO = objRS[i].getValue('custrecord_ts_rspo_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var subTotal = 0;
			var asnAmt = 0;

			dLog('createCompositeTradingOrder', 'Blanket PO line Id = ' + blanketPOLine);
			dLog('createCompositeTradingOrder', 'Blaket PO Line charge Info = ' + arrBPOMap[blanketPOLine]);

			// asn line item
			rec.selectNewLineItem('item');
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_asn_line', asnLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_rspo_no', releaseShipmentPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ap_ar_bpol', blanketPOLine);
			rec.setCurrentLineItemValue('item', 'custcol_ts_bpo_line_in_so_n_inv', blanketPO);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_po_no_in_so_n_inv', custPONo);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_incoterm', arrRSPOMapInfo[releaseShipmentPO]);
			rec.setCurrentLineItemValue('item', 'custcol_ts_inv_supplier', arrBPOInfo[blanketPO].supplier);
			rec.setCurrentLineItemValue('item', 'custcol_ts_ar_fty', arrBPOInfo[blanketPO].factory);
			rec.setCurrentLineItemValue('item', 'item', itemId);
			rec.setCurrentLineItemValue('item', 'custcol_ts_customer_item_no_line_leve', customerItemNo);
			rec.setCurrentLineItemValue('item', 'quantity', itemQty);
			rec.setCurrentLineItemValue('item', 'price', -1);

			if (!isEmpty(arrContainerMap[asnLine]))
				rec.setCurrentLineItemValue('item', 'custcol_ts_inv_container_no', arrContainerMap[asnLine].toString());

			if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

				dLog('createCompositeTradingOrder', 'Blanket Info = ' + JSON.stringify(arrBPOLineInfo[blanketPOLine]));

				rec.setCurrentLineItemValue('item', 'rate', setValue(arrBPOLineInfo[blanketPOLine].linerate));

				setTransCols(rec, arrBPOLineInfo[blanketPOLine]);
			}

			if (arrItemLotMap[itemId] == 'T') {

				dLog('createCompositeTradingOrder', 'setting sublist @ line ' + i + ' | Serial No. : ' + custPONo + ' | Qty : ' + itemQty);

				var serialLotNum = custPONo + '(' + itemQty + ')';
				dLog('createCompositeTradingOrder', 'serialLotNum = ' + serialLotNum);

				rec.setCurrentLineItemValue('item', 'location', LOC_THREESIXTY);
				rec.setCurrentLineItemValue('item', 'serialnumbers', serialLotNum);
			}

			asnAmt = rec.getCurrentLineItemValue('item', 'amount');

			rec.commitLineItem('item');

			dLog('createCompositeTradingOrder', 'Set asn line item..');

			subTotal += getFloatVal(asnAmt);

			if (!isEmpty(arrBPOMap[blanketPOLine])) {
				subTotal = setAddlCharge(rec, arrBPOMap[blanketPOLine], itemQty, arrBPOLineInfo[blanketPOLine], subTotal, '');
			}

			// gross margin
			if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin)) {
				rec.selectNewLineItem('item');
				rec.setCurrentLineItemValue('item', 'item', ITEM_GROSSMARGIN);
				rec.setCurrentLineItemValue('item', 'rate', arrBPOLineInfo[blanketPOLine].grossmargin);

				if (!isEmpty(arrBPOLineInfo[blanketPOLine])) {

					if (!isEmpty(arrBPOLineInfo[blanketPOLine].grossmargin))
						rec.setCurrentLineItemValue('item', 'custcol_ts_inv_gross_margin', arrBPOLineInfo[blanketPOLine].grossmargin);
				}

				subTotal += getFloatVal(rec.getCurrentLineItemValue('item', 'amount'));

				rec.commitLineItem('item');

				dLog('createCompositePrincipalOrder', 'Set Gross Margin line..');

				setSubTotal(rec, subTotal);
			}

		}

		var id = nlapiSubmitRecord(rec, true, true);
		dAudit('createCompositeTradingOrder', 'Created Sales Order | id = ' + id);
		return id;
	}
	catch (e) {
		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'SO Creation Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'SO Creation Error: ' + e.toString();
		}

		dLog('SO Creation Error', stErrMsg);

		nlapiSubmitField('customrecord_ts_asn', asnId, [ 'custrecord_asn_status', 'custrecord_asn_reset' ], [ ASN_STAT_ERROR, 'F' ]);

		return null;
	}
}
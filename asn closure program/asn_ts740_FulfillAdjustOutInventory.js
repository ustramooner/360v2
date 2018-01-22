/**
 * do a search for all previous transactions (SO pending fulfillment or
 * Inventory Receipts) with the same Customer PO number and same Serial Number.
 * If you find an inventory receipt, this means previous ASN must be Agency so
 * just do an inventory adjustment to adjust out the subcomponent BOM quantity.
 * If you find an SO Pending Fulfillment, this means previous ASN must be either
 * Principal or trading, so just simply fulfill the SO with the BOM quantity.
 * 
 * @param {Object}
 *            rsASN
 */
function ts740_FulfillAdjustOutInventory(rsASN) {

	try {

		dAudit('ts740_FulfillAdjustOutInventory', '>>>START<<<');

		// Item Ids
		var arrItemId = [];
		var arrCompositeItem = [];
		// final asn item added by Herman
		var final_asn_item = [];
		// end add by Herman

		var arrItemTypeMap = getASNItemType(rsASN);
		var asnId = '';
		var custPONo = '';

		for (var ix = 0; ix < rsASN.length; ix++) {

			asnId = rsASN[ix].getId();
			var item = rsASN[ix].getValue('custrecord_ts_asn_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var compositeItem = rsASN[ix].getValue('custrecord_ts_asn_composite_item', 'CUSTRECORD_TS_CREATED_FM_ASN');
			var itemQty = rsASN[ix].getValue('custrecord_ts_asn_qty', 'CUSTRECORD_TS_CREATED_FM_ASN');
			custPONo = rsASN[ix].getValue('custrecord_ts_asn_customer_po_no', 'CUSTRECORD_TS_CREATED_FM_ASN');

			if (!isEmpty(item))
				arrItemId.push(item);

			if (!isEmpty(compositeItem)) {

				// ex. InvtPart, OthCharge
				if (arrItemTypeMap[item] == 'OthCharge')
					continue;

				// added by Herman
				arrCompositeItem.push(compositeItem);

				final_asn_item.push({
					myfinal_item : item,
					mycomposite_item : compositeItem,
					asnlineqty : itemQty
				});
				// End add by Herman
			}
		}

		dAudit('ts740_FulfillAdjustOutInventory', 'Composite Item(s) = ' + arrCompositeItem);

		var arrItemLotMap = checkItemLot(arrItemId);
		var arrSubComponents = getComponentsInfo(arrCompositeItem);

		// Larger Loop added by Herman
		for ( var yx in final_asn_item) {

			var finalItem = final_asn_item[yx].myfinal_item;
			var asnCompositeItem = final_asn_item[yx].mycomposite_item;
			var asnQty = final_asn_item[yx].asnlineqty;

			dAudit('ts740_FulfillAdjustOutInventory', 'finalItem = ' + finalItem);
			dAudit('ts740_FulfillAdjustOutInventory', 'ASN Qty = ' + asnQty);
			dAudit('ts740_FulfillAdjustOutInventory', 'asnCompositeItem = ' + asnCompositeItem);

			var objTemp = arrSubComponents[asnCompositeItem];
			var saleQtyCtr = 0;
			var fullQty = false;

			for (kx in objTemp) {

				var itemId = objTemp[kx].subcompid;

				if (itemId == finalItem)
					continue;

				dLog('ts740_FulfillAdjustOutInventory', 'Subcomponent Id = ' + itemId);

				var filters = [];
				filters.push(new nlobjSearchFilter('item', null, 'anyOf', itemId));
				filters.push(new nlobjSearchFilter('inventorynumber', 'itemNumber', 'is', custPONo));

				var rs = nlapiSearchRecord('transaction', 'customsearch_trans_local_perdelivery', filters);

				dLog('ts740_FulfillAdjustOutInventory', 'No Search Results found = ' + (rs == null));

				if (rs == null)
					break;

				var transtype = rs[0].getValue('type');
				var transId = rs[0].getValue('internalid');

				dLog('ts740_FulfillAdjustOutInventory', 'Transaction type = ' + transtype);
				dLog('ts740_FulfillAdjustOutInventory', 'Transaction id = ' + transId);

				if (transtype == 'SalesOrd' && !fullQty) {

					dLog('ts740_FulfillAdjustOutInventory', 'Fulfilling Order |  id  = ' + transId);

					saleQtyCtr += fulfillOrder(transId, asnId);

					dLog('ts740_FulfillAdjustOutInventory', 'Order Qty ctr  = ' + saleQtyCtr + ' | ASN Qty = ' + asnQty);

					fullQty = (saleQtyCtr >= asnQty);
				} else if (transtype == 'ItemRcpt') {

					createAdjustment('', [ transId ], asnId);
				}
			}
		}

	}
	catch (e) {

		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'Fullfill SO Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'Fullfill SO Error: ' + e.toString();
		}

		dLog('Fullfill SO Error', stErrMsg);
	}
}

function fulfillOrder(soId, asnId) {

	try {

		var so_rec = nlapiLoadRecord('salesorder', soId);
		var soTotalQty = getSOTotalQty(so_rec);
		var ifRec = nlapiTransformRecord('salesorder', soId, 'itemfulfillment', {
			recordmode : 'dynamic',
			customform : FORM_TS_ITEM_FULFILLMENT
		});

		ifRec.setFieldValue('custbody_ts_rspo_related_asn', asnId);
		var lineCtr = ifRec.getLineItemCount('item');

		for (var i = 1; i <= lineCtr; i++) {
			ifRec.setLineItemValue('item', 'location', i, LOC_THREESIXTY);
		}

		var ifID = nlapiSubmitRecord(ifRec);

		dLog('fulfillOrder', 'Fulfillment created |  id  = ' + ifID);

		return soTotalQty;
	}
	catch (e) {

		var stErrMsg = '';
		if (e.getDetails !== undefined) {
			stErrMsg = 'Fullfill SO Error: ' + e.getCode() + '<br>' + e.getDetails() + '<br>' + e.getStackTrace();
		} else {
			stErrMsg = 'Fullfill SO Error: ' + e.toString();
		}

		dLog('Fullfill SO Error', stErrMsg);
	}
}

function getSOTotalQty(rec) {
	var lineCtr = rec.getLineItemCount('item');
	var qtyCount = 0;

	for (var i = 1; i <= lineCtr; i++) {
		qtyCount += getFloatVal(rec.getLineItemValue('item', 'quantity', i));
	}

	return qtyCount;
}

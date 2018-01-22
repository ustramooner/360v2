/**
 *@NApiVersion 2.x
 *@NScriptType scheduledscript
 */
define(['N/runtime','N/log', 'N/record', 'N/xml', 'N/file', 'N/task', 'N/search','N/format','N/util'], 
    function(runtime, log, record, xml, file, task, search, format, util){

    var _senderID = '-';
    var _asnlineitem = null;
    var _asnlinecontainer = null;

    var logResult = function(title, details){
        log.debug({
            title: title,
            details: details
        });
    }

    function isASNClosed(asn){
        return asn.getValue('custrecord_asn_status') == '1';
    }

    function isNullorEmpty(val){
        if(val == "" || val == null) return true
        else return false;
    }

    function loadAsnRecord(asnId){
        
        _senderID = '-';
        _asnlineitem = null;
        _asnlinecontainer = null;

        var asn = record.load({
                type: 'customrecord_ts_asn',
                id: asnId,
                isDynamic: true,
        });
        
        saveXML(asn.getValue('name'), xmlBuilder(asn), asn);

        
    }
    
    function xmlBuilder(asn){

        var currentDate = new Date();
        
        var tags = [getMessageHeader(currentDate, asn),
                    getEntryHeader(currentDate, asn),
                    getPorts(currentDate, asn),
                    getMilestones(currentDate, asn),
                    getManifestQty(asn),
                    getManifestUOM(asn),
                    getWeightMeasures(asn),
                    getInvoiceValue(asn),
                    getEnteredValue(asn),
                    getSuretyCode(),
                    getReferenceNumbers(asn),
                    getCommercialInvoice(asn)];

        return buildXML('entryDetails', tags);
    }

    function buildXML(parent, children){
        var content = '';
        for(var i = 0; i < children.length; i++){
            content += children[i];
        }
        return buildXMLParentTags('entryDetails', content);
    }

     function buildXMLParentTags(parent, children){
        if(children == "" || children == null) return '<' + parent + '/>';
        return '<' + parent + '>' + children + '</' + parent + '>';
    }

    function buildXMLTags(name, value){
        if(value == "" || value == null) return '<' + name + '/>';
        return '<' + name + '>' + value + '</' + name + '>';
    }

    function getMessageHeader(currentDate, asn){
        
        var content = buildXMLTags('senderName', asn.getText('custrecord_asn_bill_to_customer'));
        content += buildXMLTags('senderQualifier','ZZ');
        content += buildXMLTags('senderID', getSenderID(asn));
        content += buildXMLTags('receiverName', 'EXPEDITORS');
        content += buildXMLTags('receiverQualifer','01');
        content += buildXMLTags('receiverID', '035239425');
        content += buildXMLTags('messageType', 'ENTRY AND ISF');
        content += buildXMLTags('messageID', asn.id);
        content += buildXMLTags('messageDate', formatDate(currentDate));
        content += buildXMLTags('messageTime', formatTime(currentDate));
        
        return buildXMLParentTags('messageHeader' ,content);
    }

    function getEntryHeader(currentDate, asn){
        
        var shipmentTypeISF = '';
        var entryType = '';
        var ultimateConsigneeIRS = '';
        var countryOfOrigin = '';
        var countryOfExport = '';

        if(isASNClosed(asn) == true){
            shipmentTypeISF = '01';
            entryType = '01';
            ultimateConsigneeIRS = getSenderID(asn);
            countryOfOrigin = asn.getValue('custrecord_asn_coo');
            countryOfExport = asn.getValue('custrecord_asn_coo');
        }


        var content = [buildKeyValue('action', '00'),
                       buildKeyValue('shipmentTypeISF', shipmentTypeISF), 
                       buildKeyValue('entryType', entryType),
                       buildKeyValue('importerOfRecordIRS', getSenderID(asn)),
                       buildKeyValue('ultimateConsigneeIRS', ultimateConsigneeIRS),
                       buildKeyValue('modeOfTransport', asn.getValue('custrecord_asn_transportation_mode')),
                       buildKeyValue('vessel', getVessel(asn.getValue('custrecord_asn_vessel'))),
                       buildKeyValue('voyageFlightNumber', getFlightNumber(asn.getValue('custrecord_asn_vessel'))),
                       buildKeyValue('carrier', asn.getValue('custrecord_ts_asn_carrier_full_name')),
                       buildKeyValue('countryOfOrigin', countryOfOrigin),
                       buildKeyValue('countryOfExport', countryOfExport)];
        
        return buildTags('entryHeader', content);
    }

    function getVessel(str){
        if(str.indexOf('.') > -1){
            var vessel = str.split('.')[0];
            return vessel;
        }
        return str;
    }

    function getFlightNumber(str){
        if(str.indexOf('.') > -1){
            var vessel = str.split('.')[1];
            return vessel;
        }
        return str;
    }

    function buildKeyValue(key,value){
        return {key:key, value:value};
    }

    function buildTags(parent, nodes){
        var content = '';
        for(var i = 0; i < nodes.length; i++){
            content += buildXMLTags(nodes[i].key, nodes[i].value);
        }
        return buildXMLParentTags(parent, content);
    }

    function getPortsForDischarge(currentDate, asn){
        var content = buildXMLTags('portLocationQualifier', 'DL');
        content += buildXMLTags('portCodeType', 'D');
        content += buildXMLTags('portCode', asn.getValue('custrecord_asn_port_of_discharge'));   
        return buildXMLParentTags('port' ,content);
    }

    function getPortsForLoading(currentDate, asn){
        var content = buildXMLTags('portLocationQualifier', 'KL');
        content += buildXMLTags('portCodeType', 'K');
        content += buildXMLTags('portCode', asn.getValue('custrecord_asn_port_of_loading'));   
        return buildXMLParentTags('port' , content);
    }

    function getPorts(currentDate, asn){

        return buildXMLParentTags('ports', getPortsForDischarge(currentDate,asn) + getPortsForLoading(currentDate,asn));
    }

    function setMilestone(currentDate, asn){
        
        var content = [];
        var milestone = '';

        if(isASNClosed(asn) == true){

             content = [buildKeyValue('dateTimeQualifier', 'DEP'),
                           buildKeyValue('date', isNullorEmpty(asn.getValue('custrecord_asn_tfd_obd')) ? '' : formatDate(new Date(asn.getValue('custrecord_asn_tfd_obd')))), 
                           buildKeyValue('time', ''),
                           buildKeyValue('timeCode', '')];
             milestone = buildTags('mileStone', content);

             content = [buildKeyValue('dateTimeQualifier', 'ETA'),
                           buildKeyValue('date', isNullorEmpty(asn.getValue('custrecord_asn_shipping_eta')) ? '' : formatDate(new Date(asn.getValue('custrecord_asn_shipping_eta')))), 
                           buildKeyValue('time', ''),
                           buildKeyValue('timeCode', '')];
             milestone += buildTags('mileStone', content);

        }
        
            content = [buildKeyValue('dateTimeQualifier', 'ISF'),
                           buildKeyValue('date', isNullorEmpty(asn.getValue('custrecord_asn_tfd_obd')) ? '' : formatDate(addDays(new Date(asn.getValue('custrecord_asn_tfd_obd')), -2))), 
                           buildKeyValue('time', '0000'),
                           buildKeyValue('timeCode', 'OR')];
            milestone += buildTags('mileStone', content);

        return milestone;

    }

    function getMilestones(currentDate, asn){
        
        return buildXMLParentTags('mileStones', setMilestone(currentDate, asn));
    }

    function getManifestQty(asn){

        if(isASNClosed(asn) == true){
            return buildXMLTags('manifestQty', getASNLineItemQty(asn.id));
        }
        return buildXMLTags('manifestQty')
    }

    function getManifestUOM(asn){
        if(isASNClosed(asn) == true){
            return buildXMLTags('manifestUOM', '');
        }
        return buildXMLTags('manifestUOM')
    }

    function getWeightMeasure(qualifer, amount, uom){
        var content = buildXMLTags('qualifer', qualifer);
        content += buildXMLTags('amount', amount);
        content += buildXMLTags('uom', uom); 
        return buildXMLParentTags('weightsMeasure' , content);      
    }

    function getWeightMeasures(asn){
        if(isASNClosed(asn) == true){
            var content = getWeightMeasure('GW', getASNLineContainerGrossWeight(asn.id), 'PCS');
            content += getWeightMeasure('NT', getASNLineContainerNetWeight(asn.id), 'PCS');
            return buildXMLParentTags('weightsMeasures', content);
        }

        return buildXMLParentTags('weightsMeasures', getWeightMeasure('','',''));
    }

    function getSumLineItemAmountWithCommission(asn){
        var asnline = getASNLineItem(asn.id);
        var com = getCommission(asn);
        var sum = 0;
        
        if(isASNClosed(asn)){
            for(var i =0; i < asnline.length; i++){
                    sum += ((parseFloat(asnline[i].getValue('custrecord_ts_asn_amt')) || 0 ) * com);
            }    
        }

        return sum;
    }

   function getSumLineItemAmount(asn){
        var asnline = getASNLineItem(asn.id);
        var sum = 0;
        
        if(isASNClosed(asn)){
            for(var i =0; i < asnline.length; i++){
                    sum = sum + (parseFloat(asnline[i].getValue('custrecord_ts_asn_amt')) || 0);
            }    
        }

        return sum;
    }

    function getEnteredValue(asn){
        
        var enteredvalue = getSumLineItemAmount(asn);
        
        return buildXMLTags('enteredValue', enteredvalue);
    }

    function getInvoiceValue(asn){

        var invoicevalue = getSumLineItemAmount(asn);

        return buildXMLTags('invoiceValue', invoicevalue);
    }

    function getSuretyCode(){
        return buildXMLTags('suretyCode');
    }

    function getReferenceNumber(type, number, quantity, unit){
        var content = buildXMLTags('type', type);
        content += buildXMLTags('number', number);
        content += buildXMLTags('quantity', quantity);
        content += buildXMLTags('unit', unit);
        return buildXMLParentTags('referenceNumber', content);
    }

    function getReferenceNumbers(asn){
        var content = '';

        content = getReferenceNumber('MB', asn.getValue('custrecord_ts_asn_bill_of_lading_no'),
            getASNLineItemQty(asn.id), 'PCS');

        if(isASNClosed(asn)){
            var linecontainer = getASNLineContainer(asn.id);
            var count = 0;
            var containers= '';
            for(var i = 0; i < linecontainer.length; i++){
                var containerNumber = linecontainer[i].getValue('custrecord_ctnr_dtl_ctnr_num');
                var containerType = linecontainer[i].getValue('custrecord_cntr_dtl_ctnr_type');
                var occurance = countOccurance(containerNumber, containerType, linecontainer);
                linecontainer = occurance.linecontainer;
                count = occurance.count;
                i--;
                containers += getReferenceNumber('CO', containerNumber, count, containerType);
            }
            content += containers;
        }
 
        return buildXMLParentTags('referenceNumbers', content);
    }

    function countOccurance(number, type, linecontainer){
        var count = 0;
        for(var i = 0; i < linecontainer.length; i++){
            if(number == linecontainer[i].getValue('custrecord_ctnr_dtl_ctnr_num') &&
                type == linecontainer[i].getValue('custrecord_cntr_dtl_ctnr_type')){
                linecontainer.splice(i,1);
                count++;
                i--;
            }
        }
        return {linecontainer : linecontainer, count : count};
    }

    function getCommercialInvoiceQty(asn){
        
        var qty = '';
        var uom = '';

        if(isASNClosed(asn)){
            qty = getASNLineItemQty(asn.id);
            uom = 'PCS';
        }

        var content = buildXMLTags('quantity', qty);
        content += buildXMLTags('uom', uom);

        return buildXMLParentTags('commercialInvoiceQuantity' , content); 
    
    }

    function getCommercialInvoice(asn){
        var content = buildXMLTags('commercialInvoiceNumber', asn.getValue('name'));
        content += buildXMLTags('commercialInvoiceDate', asn.getValue('custrecord_asn_tfd_obd'));
        content += buildXMLTags('commercialInvoiceQuantity', getCommercialInvoiceQty(asn));
        content += buildXMLTags('grossInvoiceValue', getGrossInvoiceValue(asn));
        content += buildXMLTags('customsInvoiceValue');
        content += buildXMLTags('invoiceCurrency', getCustomerCurrency(asn.getValue('custrecord_asn_bill_to_customer')));
        content += buildXMLTags('incoTerms', (isASNClosed(asn) ? 'incoterms' : ''));
        content += buildXMLTags('entities', getCommercialEntityAddresses(asn));
        content += buildXMLTags('relatedPartyFlag', (isASNClosed(asn) ? 'N' : ''));
        content += buildXMLTags('adjustments', buildXMLParentTags('adjustments', getAdjustment(asn)));
        content += buildXMLTags('commercialInvoiceLine', getCommercialInvoiceLine(asn));
        return buildXMLParentTags('commercialInvoice', content);
    }

    function getGrossInvoiceValue(asn){
        var grossvalue = getSumLineItemAmount(asn);
        return grossvalue;
    }

    function getCustomInvoiceValue(asn){
        var invoicevalue = getSumLineItemAmount(asn);
        return invoicevalue;
    }

    function getCustomerGroup(customerId){
        var customer = getCustomer(customerId);
        return customer.getValue('custentity_ts_customer_group');
    }

    function getCustomerCurrency(customerId){
        var customer = getCustomer(customerId);
        return customer.getValue('currency');
    }

    function getCustomer(customerId){
        var customer = record.load({
                type: 'customer',
                id: customerId,
                isDynamic: true
        });
        return customer;
    }

    function getCommercialEntityAddresses(asn){
        var content = getCommercialEntityAddressSE(asn);
        content += getCommercialEntityAddressMF(asn);
        content += getCommercialEntityAddressSE(asn);
        content += getCommercialEntityAddressST(asn);
        return content;
    }

    function getCommercialEntityAddressST(asn){
        var entityAddress = {
            addressType : 'ST',
            name : asn.getValue('custrecord_ts2_asn_isf_ship_to'),
            address1 : asn.getValue('custrecord_ts2_asn_isf_shipto_add_1'),
            address2 : asn.getValue('custrecord_ts2_asn_isf_shipto_add_2'),
            address3 : asn.getValue('custrecord_ts2_asn_isf_shipto_add_3'),
            address4 : asn.getValue('custrecord_ts2_asn_isf_shipto_add_4'),
            city : asn.getValue('custrecord_ts2_asn_isf_shipto_city'),
            stateProvince : asn.getValue('custrecord_ts2_asn_isf_shipto_state'),
            postalCode : asn.getValue('custrecord_ts2_asn_isf_shipto_postl_code'),
            countryCode : asn.getValue('custrecord_ts2_asn_isf_shipto_country'),
            contactName : asn.getValue('custrecord_ts2_asn_isf_shipto_ctc'),
            telephone : asn.getValue('custrecord_ts2_asn_shipto_telephone'),
            facismile : asn.getValue('custrecord_ts2_asn_shipto_fax'),
            electronicMail : asn.getValue('custrecord_ts2_asn_shipto_email')
        };
        return getCommercialEntityAddress(entityAddress);
    }

    function getCommercialEntityAddressCN(asn){
        var entityAddress = {
            addressType : 'CN',
            name : asn.getValue('custrecord_ts2_asn_isf_customer'),
            address1 : asn.getValue('custrecord_ts2_asn_isf_cust_add_1'),
            address2 : asn.getValue('custrecord_ts2_asn_isf_cust_add_2'),
            address3 : asn.getValue('custrecord_ts2_asn_isf_cust_add_3'),
            address4 : asn.getValue('custrecord_ts2_asn_isf_cust_add_4'),
            city : asn.getValue('custrecord_ts2_asn_isf_cust_city'),
            stateProvince : asn.getValue('custrecord_ts2_asn_isf_cust_state'),
            postalCode : asn.getValue('custrecord_ts2_asn_isf_cust_postl_code'),
            countryCode : asn.getValue('custrecord_ts2_asn_isf_cust_country_cd'),
            contactName : asn.getValue('custrecord_ts2_asn_isf_cust_ctc'),
            telephone : asn.getValue('custrecord_ts2_asn_cust_telephone'),
            facismile : asn.getValue('custrecord_ts2_asn_cust_fax'),
            electronicMail : asn.getValue('custrecord_ts2_asn_cust_email')
        };
        return getCommercialEntityAddress(entityAddress);
    }

    function getCommercialEntityAddressMF(asn){
        var entityAddress = {
            addressType : 'MF',
            name : asn.getValue('custrecord_ts2_asn_isf_fact'),
            address1 : asn.getValue('custrecord_ts2_asn_isf_fact_a1'),
            address2 : asn.getValue('custrecord_ts2_asn_isf_fact_a2'),
            address3 : asn.getValue('custrecord_ts2_asn_isf_fact_a3'),
            address4 : asn.getValue('custrecord_ts2_asn_isf_fact_a4'),
            city : asn.getValue('custrecord_ts2_asn_isf_fact_ci'),
            stateProvince : asn.getValue('custrecord_ts2_asn_isf_fact_pr'),
            postalCode : asn.getValue('custrecord_ts2_asn_isf_fact_postl_code'),
            countryCode : asn.getValue('custrecord_ts2_asn_isf_fact_country'),
            contactName : asn.getValue('custrecord_ts2_asn_isf_fact_cn'),
            telephone : asn.getValue('custrecord_ts2_asn_isf_fact_tel'),
            facismile : asn.getValue('custrecord_ts2_asn_isf_fact_fax'),
            electronicMail : asn.getValue('custrecord_ts2_asn_isf_fact_email')
        };
        return getCommercialEntityAddress(entityAddress);
    }

    function getCommercialEntityAddressSE(asn){
        var entityAddress = {
            addressType : 'SE',
            name : asn.getValue('custrecord_ts2_asn_isf_vendor'),
            address1 : asn.getValue('custrecord_ts2_asn_isf_vndr_add_1'),
            address2 : asn.getValue('custrecord_ts2_asn_isf_vndr_add_2'),
            address3 : asn.getValue('custrecord_ts2_asn_isf_vndr_add_3'),
            address4 : asn.getValue('custrecord_ts2_asn_isf_vndr_add_4'),
            city : asn.getValue('custrecord_ts2_asn_isf_vndr_city'),
            stateProvince : asn.getValue('custrecord_ts2_asn_isf_vndr_state'),
            postalCode : asn.getValue('custrecord_ts2_asn_isf_vndr_postal_code'),
            countryCode : asn.getValue('custrecord_ts2_asn_isf_vndr_country_cd'),
            contactName : asn.getValue('custrecord_ts2_asn_isf_vndr_ctc'),
            telephone : asn.getValue('custrecord_ts2_asn_vndr_telephone'),
            facismile : asn.getValue('custrecord_ts2_asn_vndr_fax'),
            electronicMail : asn.getValue('custrecord_ts2_asn_vndr_email')
        };
        return getCommercialEntityAddress(entityAddress);
    }

    function getCommercialEntityAddress(entityAddress){
        var content = buildXMLTags('addressType', entityAddress.addressType);
        content += buildXMLTags('name', entityAddress.name);
        content += buildXMLTags('address1', entityAddress.address1);
        content += buildXMLTags('address2', entityAddress.address2);
        content += buildXMLTags('address3', entityAddress.address3);
        content += buildXMLTags('address4', entityAddress.address4);
        content += buildXMLTags('city', entityAddress.city);
        content += buildXMLTags('stateProvince', entityAddress.stateProvince);
        content += buildXMLTags('postalCode', entityAddress.postalCode);
        content += buildXMLTags('countryCode', entityAddress.countryCode);
        content += buildXMLTags('contactName', entityAddress.contactName);
        content += buildXMLTags('telephone', entityAddress.telephone);
        content += buildXMLTags('facismile', entityAddress.facismile);
        content += buildXMLTags('electronicMail', entityAddress.electronicMail);                                    
        return buildXMLParentTags('entityAddress', content);
    }

     function getAdjustmentType(name){
        var types = ['PAK.MSC-Label',
                    'ROL.MSC-Royalty',
                    'OTR.MSC-Testing',
                    'OTR.MSC-Film',
                    'OTR.MSC-Sample',
                    'OTR.MSC-MOQ',
                    'OTR.MSC-LCL',
                    'OTR.MSC-Transportation',
                    'OTR.MSC-Tooling',
                    'OTR.MSC-Rework',
                    'OTR.MSC-Printing'];

        if(name.indexOf('.') > -1){
            name = name.split('.')[0];
        }

        for(var i = 0; i < types.length; i++){
            if(types[i].indexOf(name) > -1){
                return types[i].split('.')[0];
            }
        }
        return '';
    }

    function getAdjustment(asn){
        var asnline = getASNLineItem(asn.id);
        
        var tags = '';
        for(var i = 0; i < asnline.length; i++){
            asnlineItem = asnline[i].getText('custrecord_ts_asn_item');
          logResult('Checking Adjustment', 'Item ' + asnlineItem);
            var type =getAdjustmentType(asnlineItem);
          logResult('Checking Adjustment Type', 'Type ' + type);
            if(type != ''){
                var content = buildXMLTags('type', type);        
                content += buildXMLTags('addDeductFlag', 'A');
                var sum = getSumLineItemAmount(asn);
                var sumwithcom = getSumLineItemAmountWithCommission(asn);
                logResult('SUM', sum);
                logResult('SUM with Com', sumwithcom);
                content += buildXMLTags('amount', sum + sumwithcom);
                content += buildXMLTags('includedInInvoiceTotal', (isASNClosed(asn) ? 'N' : ''));
                content += buildXMLTags('dutiable', (isASNClosed(asn) ? 'Y' : ''));
                tags += buildXMLParentTags('adjustment', content);
            }
        }

        
        return tags;
    }

    function getCommercialInvoiceLine(asn){
        var asnline = getASNLineItem(asn.id);
        var content = '';
        for(var i = 0; i < asnline.length; i++){
            logResult('Item', 'Getting details from item ' + asnline[i].getValue('custrecord_ts_asn_item'));
            var itemRecord = getItemDetail(asnline[i].getValue('custrecord_ts_asn_item'));
            logResult('Item', 'Loading Item ' + itemRecord.getValue('custitem_ts_item_customer_item_no'));
            var invoiceline = {
                asn : asn,
                no : i + 1,
                asn_item : itemRecord.getValue('custitem_ts_item_customer_item_no'),
                partdesciption : itemRecord.getValue('purchasedescription'),
                ponumber: getLineItemPONumber(asn, asnline[i]),
                mbnumber: asn.getValue('custrecord_ts_asn_bill_of_lading_no'),
                relatedPartyFlag : (isASNClosed(asn) ? 'N' : ''),
                invoiceqty : getinvoiceqty(asn, asnline[i]),
                invoiceQtyUOM : (isASNClosed(asn) ? 'PCS' : ''),
                countryoforigin : asn.getValue('custrecord_asn_coo'),
                countryofexport : asn.getValue('custrecord_asn_coo'),
                invoiceValue : getSumLineItemAmount(asn),
                enteredValue : getSumLineItemAmount(asn),
                hts : itemRecord.getValue('custitem_ts_item_hts_code'),
                htsdescription : itemRecord.getValue('custitem_ts_item_hts_description')
            };
            logResult('Item', 'Loaded Item ' + itemRecord.getValue('custitem_ts_item_customer_item_no'));
            content += setCommercialInvoiceLine(invoiceline);
        }
        return buildXMLParentTags('commercialInvoiceLine', content);
    }

    function getLineItemPONumber(asn, asnline){
        if(isASNClosed(asn)){
            return asnline.getValue('custrecord_ts_asn_customer_po_no');
        }
        return '';
    }

    function getinvoiceqty(asn, asnline){
        if(isASNClosed(asn)){
            return asnline.getValue('custrecord_ts_asn_qty');
        }
        return '';
    }



    function setCommercialInvoiceLine(invoiceline){
        var content = buildXMLTags('invoiceLineNumber', invoiceline.no);
        content += buildXMLTags('partNumber', invoiceline.asn_item);
        content += buildXMLTags('partDescription', invoiceline.partdesciption);
        content += buildXMLTags('PONumber', invoiceline.ponumber);
        content += buildXMLTags('MBNumber', invoiceline.mbnumber);
        content += buildXMLTags('relatedPartyFlag', invoiceline.relatedPartyFlag);
        content += buildXMLTags('invoiceQty', invoiceline.invoiceqty);
        content += buildXMLTags('invoiceQtyUOM', invoiceline.invoiceQtyUOM);
        content += buildXMLParentTags('weightsMeasures', getWeightsMeasure(invoiceline.asn));
        content += buildXMLTags('countryOfOrigin', invoiceline.countryoforigin);
        content += buildXMLTags('countryOfExport', invoiceline.countryofexport);
        content += buildXMLTags('invoiceValue', invoiceline.invoiceValue);
        content += buildXMLTags('enteredValue', invoiceline.enteredValue);
        content += buildXMLTags('tariffDetail', getTarifDetail(invoiceline.asn, invoiceline.hts, invoiceline.htsdescription));
        return content;
    }



    function getWeightsMeasure(asn){

        var weightMeasure = {};        

        if(isASNClosed(asn)){

            var asnlinecontainer = getASNLineContainer(asn.id);
            var content = '';
            for(var i = 0; i < asnlinecontainer.length; i++){
                weightMeasure = {
                    qualifer : 'GW',
                    amount : asnlinecontainer[i].getValue('custrecord_ts_ctnr_dtl_gross_weight'),
                    uom : asnlinecontainer[i].getText('custrecord_ts_ctnr_dtl_weight_unit').indexOf('LB') > -1 ? '#' : 'K'
                }
                content += setWeightsMeasure(weightMeasure);
                weightMeasure = {
                    qualifer : 'NT',
                    amount : asnlinecontainer[i].getValue('custrecord_ts_ctnr_dtl_net_weight'),
                    uom : asnlinecontainer[i].getText('custrecord_ts_ctnr_dtl_weight_unit').indexOf('LB') > -1 ? '#' : 'K'
                }
                content += setWeightsMeasure(weightMeasure);
            }
            return content;
        }
        else{
            weightMeasure = {
                qualifer : '',
                amount :'',
                uom : ''
            };
            return setWeightsMeasure(weightMeasure);
        }
    }

    function setWeightsMeasure(weightMeasure){
        var content = buildXMLTags('qualifer', weightMeasure.qualifer);
        content += buildXMLTags('amount', weightMeasure.amount);
        content += buildXMLTags('uom', weightMeasure.uom);
        return buildXMLParentTags('weightsMeasure',content);
    }

    function getTarifDetail(asn, hts, htsdescription){
        var tariff = {
            number : hts,
            description : htsdescription,
            countryofexport : (isASNClosed(asn) ? asn.getValue('custrecord_asn_coo') : ''),
            countryoforigin : asn.getValue('custrecord_asn_coo'),
            enteredvalue : getSumLineItemAmount(asn),
            enteredvaluecurrency : (isASNClosed(asn) ? getCustomerCurrency(asn.getValue('custrecord_asn_bill_to_customer')) : '')
        };
        return setTarifDetail(tariff);
    }

    function setTarifDetail(tariff){
        var content = buildXMLTags('tariffNumber', tariff.number);
        content += buildXMLTags('tariffDescription', tariff.description);
        content += buildXMLTags('countryOfExport', tariff.countryofexport);
        content += buildXMLTags('countryOfOrigin', tariff.countryoforigin);
        content += buildXMLTags('enteredValue', tariff.enteredvalue);
        content += buildXMLTags('enteredValueCurrency',tariff.enteredvaluecurrency);
        content += buildXMLTags('manufacturerAddress', getManufacturerAddress());
        return content;
    }

    function getManufacturerAddress(){
        var manufacturerAddress = {
            name : 'Shenzhen Eversun Electronic Toys Co., Ltd.',
            address1 : 'Building 6, Wantou Industrial',
            address2 : 'Zone, Songrui Road, Songgang Town,',
            address3 : 'Baoan, Shenzhen, Guangdong,',
            address4 : 'China',
            city : 'BaoAn',
            stateprovince : '44',
            postalcode : '518100',
            countrycode : 'CN'
        };
        return setManufacturerAddress(manufacturerAddress);
    }

    function setManufacturerAddress(manufacturerAddress){
        var content = buildXMLTags('manufacturerName', manufacturerAddress.name);
        content += buildXMLTags('manufacturerAddress1', manufacturerAddress.address1);
        content += buildXMLTags('manufacturerAddress2', manufacturerAddress.address2);
        content += buildXMLTags('manufacturerAddress3', manufacturerAddress.address3);
        content += buildXMLTags('manufacturerAddress4', manufacturerAddress.address4);
        content += buildXMLTags('manufacturerCity', manufacturerAddress.city);                
        content += buildXMLTags('manufacturerStateProvince', manufacturerAddress.stateprovince);
        content += buildXMLTags('manufacturerPostalCode', manufacturerAddress.postalcode);
        content += buildXMLTags('manufacturerCountryCode', manufacturerAddress.countrycode);      
        return content; 
    }

    function loadItemRecord(itemId){
        
        var item = record.load({
                type: 'inventoryitem',
                id: itemId,
                isDynamic: false,
        });



        return item || {getValue : function(){return 0;}};
    }

    var filters = function(Id){
            return [
                    {
                        name: 'custrecord_ts_created_fm_asn',
                        operator: 'is',
                        values: Id
                    }
            ]
    }

    var columns = function(){
        return [
                {
                    name : 'custrecord_ts_asn_qty'
                },
                {
                    name : 'custrecord_ts_asn_item'
                },
                {
                    name : 'custrecord_ts_asn_amt'
                },
                {
                    name : 'custrecord_ts_asn_customer_po_no'
                }
            ];
    }

    function getASNLineItemQty(Id){        
        var r = getASNLineItem(Id);

        var qty = 0;
        for(var i = 0; i < r.length; i++){
            qty += (parseInt(r[i].getValue('custrecord_ts_asn_qty'))||0);
        }
        return qty;
    }

    function getASNLineItem(Id){
        
        if(_asnlineitem != null){
            return _asnlineitem;
        }

        var result = search.create({
                type: 'customrecord_ts_asn_item_details',
                filters: filters(Id),
                columns: columns(),
                title: 'ASN Line Items'
        });

        _asnlineitem = result.run().getRange({
                                start: 0,
                                end: 1000
                            });
        return _asnlineitem;
    }

    function getASNLineContainerGrossWeight(Id){
        var gw = getASNLineContainer(Id);
        var gwSum = 0;
        for(var i = 0; i < gw.length; i++){
            gwSum += ((parseInt(gw[i].getValue('custrecord_ts_ctnr_dtl_gross_weight'))||0) *
                (parseInt(gw[i].getValue('custrecord_ctnr_dtl_no_of_ctn'))||0));
        }
        return gwSum;
    }

    function getASNLineContainerNetWeight(Id){
        var net = getASNLineContainer(Id);
        var netSum = 0;
        for(var i = 0; i < net.length; i++){
            netSum += ((parseInt(net[i].getValue('custrecord_ts_ctnr_dtl_net_weight'))||0) *
                (parseInt(net[i].getValue('custrecord_ctnr_dtl_no_of_ctn'))||0));
        }
        return netSum;
    }

     function getASNLineContainer(Id){

        if(_asnlinecontainer != null){
            return _asnlinecontainer;
        }

        var result = search.create({
                type: 'customrecord_container_details',
                filters: [
                                {
                                    name: 'custrecord_ctnr_dtl_asn_no',
                                    operator: 'is',
                                    values: Id
                                }
                        ],
                columns: [
                                {
                                    name : 'custrecord_ts_ctnr_dtl_gross_weight'
                                },
                                {
                                    name : 'custrecord_ts_ctnr_dtl_net_weight'
                                },
                                {
                                    name : 'custrecord_ctnr_dtl_no_of_ctn'
                                },
                                {
                                    name : 'custrecord_ctnr_dtl_ctnr_num'
                                },
                                {
                                    name : 'custrecord_ts_ctnr_dtl_weight_unit'
                                }
                            ],
                title: 'ASN Line Containers'
        });

        _asnlinecontainer = result.run().getRange({
                                start: 0,
                                end: 1000
                            });

        return _asnlinecontainer;
    }

    function getItemDetail(Id){
        var result = search.create({
                type: 'item',
                filters: [
                                {
                                    name: 'internalid',
                                    operator: 'is',
                                    values: Id
                                }
                        ],
                columns: [
                                {
                                    name : 'custitem_ts_item_customer_item_no'
                                },
                                {
                                    name : 'purchasedescription'
                                },
                                {
                                    name : 'custitem_ts_item_hts_code'
                                },
                                {
                                    name : 'custitem_ts_item_hts_description'
                                }
                            ],
                title: 'ASN Line Containers'
        });

        var r = result.run().getRange({
                                start: 0,
                                end: 1000
                            });
        logResult('Get Item Result', r.length);
        if(r.length > 0){
            return r[0];
        }else{
            return {getValue : function(id){return [];}};
        }
    }

 function getCommission(asn){
                var sourcingFees = getSourcingFees(asn.getValue('custrecord_ts2_asn_isf_customer')||0,
            asn.getValue('custrecord_ts2_asn_isf_vendor')||0,
            asn.getValue('custrecord_ts2_asn_isf_fact')||0,
            getCustomerGroup(asn.getValue('custrecord_asn_bill_to_customer'))||0);

        if(sourcingFees.length > 0){
            return parseFloat(sourcingFees[0].getValue('custrecord_sourcingfee_commis')) || 0;
        }
        return 0;
    }

    function getSourcingFees(customer, vendor, factory){
      if(customer == '' || vendor == '' || factory == ''){ return {getValue : function(id){return {};}}}
        var result = search.create({
                type: 'customrecord_sourcingfee_combination',
                filters: [
                                {
                                    name: 'custrecord_sourcingfee_customercode',
                                    operator: 'is',
                                    values: customer
                                },
                                {
                                    name: 'custrecord_sourcingfee_supplier',
                                    operator: search.Operator.IS,
                                    values: vendor
                                },
                                {
                                    name: 'custrecord_sourcing_fty',
                                    operator: search.Operator.IS,
                                    values: factory
                                }

                        ],
                columns: [
                                {
                                    name : 'custrecord_sourcingfee_commis'
                                }
                            ],
                title: 'Sourcing Fee'
        });

         var r = result.run().getRange({
                                start: 0,
                                end: 1000
                            });

         return r;
    }


     function formatDate(date){
        if(util.isDate(date)){
            return date.getFullYear().toString() + addZero((date.getMonth()+1).toString()) + addZero(date.getDate().toString());    
        }
        return '';
    }

    function formatTime(date){
        if(util.isDate(date)){
            return addZero(date.getHours().toString()) + addZero(date.getMinutes().toString()) + addZero(date.getSeconds().toString());
        }
        return '';
    }

    function addDays(dat, days){
        dat.setDate(dat.getDate() + days);
        return dat;
    }

    function addZero(val){
        if(val.length < 2) return '0' + val;
        else return val;
    }

    function getSenderID(asn){

        if(_senderID != '-'){
            return _senderID;
        }

        var subsidiarySettingsId = asn.getValue('custrecord_ts2_asn_sub_set');
        var subsidiarySettings = getSubsidiarySettings(subsidiarySettingsId);
        var innovageSenderID = subsidiarySettings.getValue('custrecord_ts2_sub_setting_send_id_inno');
        var merchSourceSenderID = subsidiarySettings.getValue('custrecord_ts2_sub_setting_send_id_ms');
        var customerName = asn.getText('custrecord_asn_bill_to_customer');
        if(isMerchSource(customerName)) _senderID = merchSourceSenderID;
        else if (isInnovage(customerName)) _senderID = innovageSenderID;
        else _senderID = '';

        return _senderID;

    }

    function getSubsidiarySettings(subsidiarySettingsId){
        if(isNullorEmpty(subsidiarySettingsId)){return {getValue : function(id){return {};}}}
        var subsidiarySettings = record.load({
            type: 'customrecord_ts_sub_settings',
            id: subsidiarySettingsId,
            isDynamic: true,
        });
        return subsidiarySettings;
    }

    function isMerchSource(customerName){
        if(customerName.indexOf('MerchSource') > -1){
            return true;
        }
        return false;
    }

    function isInnovage(customerName){
        if(customerName.indexOf('Innovage') > -1){
            return true;
        }
        return false;
    }

    function saveXML(filename, xmlString, asn){
      
       if(isASNClosed(asn)){
            filename = 'post' + filename;
        }else{
            filename = 'pre' + filename;
        }
      
      
        var xmlFile = file.create({
            name : filename + '.xml',
            contents : xmlString,
            fileType : file.Type.XMLDOC,
            folder : 58726
        });
        var xmlFileId = xmlFile.save();
      
        record.submitFields({
               type: 'customrecord_ts_asn',
               id: asn.id,
               values: {
                custrecord_xml_file : xmlFileId
               }
           });
      
        uploadFile(xmlFileId);
    }
      
       function uploadFile(fileId){
        var scriptId = 'customscript_upload_asn_xml';

        var mrTask = task.create({
            taskType : task.TaskType.SCHEDULED_SCRIPT,
            scriptId : scriptId,
            deploymentId : 1,
            params : {custscript_xml_file_id : fileId}
        });

        var mrTaskId = mrTask.submit();
    }

    function execute(context){

        var scriptObj = runtime.getCurrentScript();
        var asnId = scriptObj.getParameter({name: 'custscript_asn_id_param'});
        logResult('ASN ID', 'Loading ' + asnId + '...');
        if(isNullorEmpty(asnId)== false){
            loadAsnRecord(asnId);
        }
        logResult('ASN ID', 'Loaded ' + asnId);

    }

    return {
        execute : execute
    }

});
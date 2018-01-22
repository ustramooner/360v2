/**
 *@NApiVersion 2.x
 *@NScriptType MapReduceScript
 */
define(['N/search', 'N/record', 'N/log', 'N/file', 'N/runtime', 'N/email',  '../src/lib/obj_asn_xml_gen', '../src/lib/xml_shipments'], function(search, record, log, file, runtime, email, asn_xml_gen, xmlShipments) {

    function sendToFTP(xmlId){
        
        var xmlFile = [file.load({
            id : xmlId
        })];

        email.send({
            author : 74782,
            recipients : 'jeff@onepac.net',
            subject : 'MS XML',
            body : 'MS XML File',
            attachments : xmlFile
        });

        log.debug('MS XML Sent', 'File ID:' + xmlId);

    }

    function updateASN_MS_XML_Sent(asnArr){
        for(var i = 0; i < asnArr.length; i++){
            record.submitFields({
                type : 'customrecord_ts_asn',
                id : asnArr[i],
                values : {
                    custrecord_ts2_asn_ms_xml_sent : true
                }
            });
            log.debug('ASN Record', 'ASN ID ' + asnArr[i] + ' is updated');
            var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
            log.debug('Remaining Usage', remainingUsage);
        }
    }

    function saveXML(content){
        var xmlFile = file.create({
                name: 'Shipments.xml',
                contents: content,
                fileType: file.Type.XMLDOC,
                folder: 58726
        });
        var xmlFileId = xmlFile.save();
        log.debug('Shipments.xml Created', 'File:' + xmlFileId);
        return xmlFileId;
    }

    function getASN(asnId){
        return record.load({
            type : 'customrecord_ts_asn',
            id : asnId
        });
    }

    function getASNLine(asnLineId){
        return record.load({
            type : 'customrecord_ts_asn_item_details',
            id : asnLineId
        }) || emptyObj;
    }

    function getReleasePOLine(poLineId){
        if(poLineId){
            var po = record.load({
                type : 'purchaseorder',
                id : poLineId
            }) || emptyObj;
            return po;  
        }else{
            return emptyObj;
        }
        
    }

    function getContainer(cId){
        return record.load({
            type : 'customrecord_container_details',
            id : cId
        });
    }

    var emptyObj = {
        getValue : function(p){
            return {};
        },
        getText : function(p){
            return {};
        }
    };

    function getInputData() {
        
        var asnMS = [];

        var results = search.create({
            type : 'customrecord_container_details',
            filters : [{//filter for closed asn
                name : 'custrecord_asn_status',
                join : 'custrecord_ctnr_dtl_asn_no',
                operator : search.Operator.IS,
                values : [1] 
            },{
                name : 'custrecord_ts2_asn_ms_xml_sent',
                join : 'custrecord_ctnr_dtl_asn_no',
                operator : search.Operator.IS,
                values : ['F']
            }],
            columns : ['custrecord_ctnr_dtl_asn_no',
                       'custrecord_ctnr_dtl_asn_item_line',
                       'custrecord_ts_ctnr_dtl_asn_item_qty',
                       'custrecord_ctnr_dtl_ctnr_num',
                       'custrecord_cntr_dtl_ctnr_type',
                       'custrecord_ts2_ctnr_seal_num',
                       'custrecord_ctnr_dtl_no_of_ctn',
                       'custrecord_ts_ctnr_dtl_ctn_measure_unit',
                       'custrecord_ts_ctnr_dtl_ctn_height',
                       'custrecord_ctnr_dtl_ctn_width',
                       'custrecord_ctnr_dtl_ctn_length',
                       'custrecord_ts_ctnr_dtl_gross_weight',
                       'custrecord_ts_ctnr_dtl_weight_unit'],
            title : 'Get all containers'
        });
        
        results.run().each(function(result){
            asnMS.push(result);
            return true;
        });

        return asnMS;
        /*var resultSet = result.run().getRange(0,1000);
        if(resultSet.length > 0){
            log.debug('Containers Found', resultSet.length);
            return resultSet;
        }else{
            log.debug('No Containers Found','------');
            return [];
        }*/

    
    }


    function map(context){
        var result = JSON.parse(context.value);
        context.write(result.id, result.values);
    }

    function reduce(context){
        var containerId = context.key;
        var result = JSON.parse(context.values[0]);

        var asn = getASN(result['custrecord_ctnr_dtl_asn_no'][0].value);
        var asnLine = getASNLine(result['custrecord_ctnr_dtl_asn_item_line'][0].value);
        var rpoLine = getReleasePOLine(asnLine.getValue('custrecord_ts_rspo_po_no'));
        var container = getContainer(containerId);
        
        log.debug('asn vs asnline vs rpoline', asn.id + ' vs ' + asnLine.id + ' vs ' + rpoLine.id);
        
        var xml = xmlShipments.buildShipment(asn, asnLine, rpoLine, container);
        
        log.debug('Shipment', xml);
        
        context.write(asn.id, xml);
    
    }

    function summarize(summary){
        var asnId = [];
        var xml = '';
        summary.output.iterator().each(function(key, value){
            if(asnId.indexOf(key) < 0){             
                asnId.push(key);   
            }
            xml += value;
            return true;
        });
        log.debug('ASN IDs', asnId);
        log.debug('Root', xml);
        if(asnId.length > 0){
            var xmlFileId = saveXML('<?xml version="1.0"?><ROOT>' + xml + '</ROOT>');
            if(xmlFileId != null && xmlFileId != ''){
                updateASN_MS_XML_Sent(asnId);
                sendToFTP(xmlFileId);
            }
        }
    }

    return {
        getInputData : getInputData,
        map : map,
        reduce : reduce,
        summarize : summarize
    }

});
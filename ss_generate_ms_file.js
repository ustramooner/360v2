/**
 *@NApiVersion 2.x
 *@NScriptType scheduledscript
 */

 define(['N/runtime', 'N/search','N/record','N/log', 'N/file', 'N/task', 'N/email',  '../src/lib/xml_shipments' ,'../src/lib/gen_scripts'], 
        function(runtime, search, record,log, file, task,  email, xmlShipments, genScripts){

 	var executionLimit = 1000;

 	function getContainers(){
 		var result = search.create({
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
 		var resultSet = result.run().getRange(0,1000);
 		if(resultSet.length > 0){
 			log.debug('Containers Found', resultSet.length);
 			return resultSet;
 		}else{
 			log.debug('No Containers Found','------');
 			return [];
 		}
 	}


 	function execute(context){
 		
 		var xml = '';

 		var currentASNId = 0;
 		var currentASNLineId = 0;
 		var currentRPOLineId = 0;
 		var asn = {};
 		var asnLine = {};
 		var rpoLine = {};
 		var asnForUpdate = [];
 		var containers = getContainers();		
 		var shipmentsCount = 0;
 		if(containers.length > 0){
 			
 			log.debug('Generation of MS XML Start', '<----');

 			for(var i = 0; i < containers.length; i++){

 				if(containers[i].getValue('custrecord_ctnr_dtl_asn_no') && currentASNId != parseInt(containers[i].getValue('custrecord_ctnr_dtl_asn_no'))){
 					asn = getASN(containers[i].getValue('custrecord_ctnr_dtl_asn_no'));
 					currentASNId = asn.id;
 					asnForUpdate.push(currentASNId);
 				}

 				if(containers[i].getValue('custrecord_ctnr_dtl_asn_item_line') && currentASNLineId != containers[i].getValue('custrecord_ctnr_dtl_asn_item_line')){
 					asnLine = getASNLine(containers[i].getValue('custrecord_ctnr_dtl_asn_item_line'));
 					currentASNLineId = asnLine.id;
 				}

 				if(currentRPOLineId != asnLine.getValue('custrecord_ts_rspo_po_no')){
 					rpoLine = getReleasePOLine(asnLine.getValue('custrecord_ts_rspo_po_no'));
 					currentRPOLineId = asnLine.getValue('custrecord_ts_rspo_po_no');	
 				}

 				log.debug('Build Shipment', 'ASN ID:' + currentASNId + ' , ASN Line ID:' + currentASNLineId + ' , RPO Line ID:' + currentRPOLineId);
 				xml += xmlShipments.buildShipment(asn, asnLine, rpoLine, containers[i]);
 				shipmentsCount++;
 				var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
 				log.debug('Remaining Usage', remainingUsage);
 				if(remainingUsage < executionLimit){
 					break;
 				}
 			}
 			var msXML = saveXML(genScripts.createNode('ROOT', xml));
 			if(msXML){
 				updateASN_MS_XML_Sent(asnForUpdate);
 				sendToFTP(msXML);
 			}else{
 				log.debug('XML File is not created','-----');
 				containers = [];
 			}
 			log.debug('Generation of MS XML is complete', 'Shipments Created: ' + shipmentsCount + ' ASN Updated:' + asnForUpdate.length + '---->');
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

	var emptyObj = {
		getValue : function(p){
			return {};
		},
		getText : function(p){
			return {};
		}
	};

	function sendToFTP(xmlId){
		
		var userObj = runtime.getCurrentUser();
		var userId = userObj.id;
		log.debug('Sending to User', userId);

		var xmlFile = [file.load({
			id : xmlId
		})];

		email.send({
			author : userId,
			recipients : ['threesixtyonepac@gmail.com'],
			subject : 'MS XML',
			body : 'MS XML File',
			attachments : xmlFile
		});

		log.debug('MS XML Sent', '----->');

	}



 	return {
		execute : execute
 	}

 });
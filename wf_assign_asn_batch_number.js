/**
 * @NApiVersion 2.x
 * @NScriptType WorkflowActionScript
 */

 define(['N/search', 'N/log', 'N/record'], function(search, log, record){

 	function getConfirmedASN(){
 		var result = search.create({
 			type : 'customrecord_ts_asn',
 			filters : [
 				{
 					name : 'custrecord_asn_status',
 					operator : search.Operator.IS,
 					values : [8]
 				}
 			],
 			title : 'Confirmed ASN Only'
 		});

 		var resultSet = result.run().getRange(0,1000);
 		log.debug('Confirmed ASN Count', resultSet.length);
 		return resultSet;
 	}

	 function onAction(context){

	 	log.debug('ASN Batch Control', 'Start');

		var asnBatchControl = context.newRecord;	 		

	 	var confirmedASN = getConfirmedASN();
	 	var batchNumber = asnBatchControl.getValue('name');
	 	log.debug('Batch Number', batchNumber);
	 	
	 	for(var i = 0; i < confirmedASN.length; i++){
	 		log.debug('Updating ASN ID', confirmedASN[i].id);
	 		record.submitFields({
	 			type : 'customrecord_ts_asn',
	 			id : confirmedASN[i].id,
	 			values : {
	 				custrecord_ts_asn_batch_code : batchNumber
	 			}
	 		})
	 	}

	 	log.debug('ASN Batch Control', 'End');


	 }

	 return {
	 	onAction : onAction
	 }


 });
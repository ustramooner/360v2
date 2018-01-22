/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

 define(['N/search','N/log'],
 	function(search, log){

 		function getLatestRPOLine(rpoId){
 			var result = search.create({
 				type : 'purchaseorder',
 				filters : [{
 					name : 'custbody_ts2_rspol_rlpo_no',
 					operator : search.Operator.IS,
 					values : [rpoId]
 				}],
 				columns : [{
 					name : 'lastmodifieddate',
 					sort : search.Sort.DESC
 				}],
 				title : 'Get Latest Release PO Line'
 			});

 			var resultSet = result.run().getRange(0, 1000);
 			if(resultSet.length > 0){
 				return resultSet[0];
 			}
 			return null;
 		}

 		function beforeLoad(context){

 			if(context.type == context.UserEventType.VIEW ||
 				context.type == context.UserEventType.EDIT){

	 			var rpo = context.newRecord;
	 			var latestRPOLine = getLatestRPOLine(rpo.id);
	 			
	 			if(latestRPOLine){
	 				log.debug('Latest BPO Line', latestRPOLine.id);
	 				rpo.setValue('custrecord_ts2_rlpo_lt_rv_rlpol', latestRPOLine.id);	
	 			}
	 			
	 		}
	 		
 		}

 		return {
 			beforeLoad : beforeLoad
 		}

 });
/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

 define(['N/search', 'N/log'],
 	function(search, log){

 		function getLatestBPOLine(bpoId){
 			var result = search.create({
 				type : 'customrecord_ts_blanket_po_line',
 				filters : [{
 					name : 'custrecord_ts_bpol_bpo_no',
 					operator : search.Operator.IS,
 					values : [bpoId]
 				}],
 				columns : [{
 					name : 'lastmodified',
 					sort : search.Sort.DESC
 				}],
 				title : 'Get Latest BPO Line'
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
 			
 					var bpo = context.newRecord;
		 			var latestBPOLine = getLatestBPOLine(bpo.id);
		 			
		 			if(latestBPOLine){
		 				log.debug('Latest BPO Line', latestBPOLine.id);
		 				bpo.setValue('custrecord_ts2_bpo_lt_rvs_bpol', latestBPOLine.id);	
		 			}
 			
 			}

 		}

 		return {
 			beforeLoad : beforeLoad
 		}

 });
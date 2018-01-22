/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */

 define(['N/record', 'N/file', 'N/log', 'N/search', 'N/encode', 'N/format','N/runtime','N/url'], 
    function(record, file, log, search, encode, format, runtime, url){

      function formatDateTime(d){


 		var formattedDateString2 = format.format({
 			value: d,
 			type: format.Type.DATE
 		});

 		return formattedDateString2;
 	}
 		function convertToEntities(tstr) {

 			var bstr = '';
 			for(i=0; i<tstr.length; i++)
 			{
 				if(tstr.charCodeAt(i)>127)
 				{
 					bstr += '&#' + tstr.charCodeAt(i) + ';';
 				}
 				else
 				{
 					bstr += tstr.charAt(i);
 				}
 			}
 			return bstr;
 		}

 		function getSublistValue(po, field, line){
 			return po.getSublistValue({
 				sublistId : 'item',
 				fieldId : field,
 				line : line
 			});
 		}

 		function getProducts(id){


 			var pl = record.load({
 				id : id,
 				type : 'customrecord_ts2_rlpo'
 			});
 			var pos = [];
 			var poList = getPuchaseOrder(id);

 			for(var i = 0; i < poList.length; i++){

 				var po = record.load({
 					id : poList[i].id,
 					type : 'purchaseorder'
 				});

 				pos.push({
 					productname : po.getValue('custbody_ts2_rspol_item_desc'),
 					pono : 'PO-' + pl.getValue('custrecord_ts2_rlpo_bpo_no'),
 					item : po.getText('custbody_ts2_rspol_item'),
 					releaseno : po.getValue('tranid'),
 					ohno : pl.getValue('custrecord_ts2_rlpo_customer_release_no'),
 					qty : po.getValue('custbody_ts2_rspol_qty')
 				});    

 			}

 			log.debug('list',pos);

 			return pos;
 		}

 		function getRPO(rpo){


 			

 			var data = null;

 			if(rpo.getValue('custrecord_ts2_rlpo_status') == '2'){

 				var factory = record.load({
	 				type : 'customrecord_fty_profile',
	 				id : rpo.getValue('custrecord_ts2_rlpo_fty')
	 			});

	 			var factory_cn = convertToEntities(factory.getText('custrecord_fty_name_cn'));
	 			var factory_address_cn = convertToEntities(factory.getText('custrecordfty_address_cn'));

	 			log.debug('Factory Details', 'factory name: ' + factory_cn + ' factory address: ' + factory_address_cn);

	 			var contact = getVendorContact(rpo.getValue('custrecord_ts2_rlpo_vendor_ctc'));
	 			log.debug('Contact', contact);
	 			data = {
	 				supplier : rpo.getText('custrecord_ts2_rlpo_supplier'),
	 				vendor : rpo.getText('custrecord_ts2_rlpo_vendor_ctc'),
	 				mainphone : contact.phone,
	 				phone : contact.mobilephone,
	 				fax :  contact.fax,
	 				factory_cn : factory_cn,
	 				factory_address_cn : factory_address_cn,

	 			};	
 			}
 			

 			return data;
 		}

 		function getVendorContact(id){
 			var contact = record.load({
 				type : 'contact',
 				id : id
 			});

 			return {
 				phone : contact.getValue('phone'),
 				mobilephone : contact.getValue('mobilephone'),
 				fax : contact.getValue('fax')
 			}
 		}

 		function getPuchaseOrder(rpoId){

 			log.debug('Searching Purchase Order', rpoId);

 			var result = search.create({
 				type : 'purchaseorder',
 				filters : [
 				{
 					name : 'mainline',
 					operator : search.Operator.IS,
 					values : ['T']
 				},
 				{
 					name : 'custbody_ts2_rspol_rlpo_no',
 					operator : search.Operator.IS,
 					values : [rpoId]
 				}
 				],
 				title : 'Purchase Orders Lines'
 			});

 			var resultSet = result.run().getRange({
 				start : 0,
 				end : 1000
 			});

 			log.debug('Result for getPuchaseOrder', resultSet.length);

 			if(resultSet != null && resultSet.length > 0){
 				return resultSet;
 			}

 			return null;

 		}


 		function afterSubmit(context){

 			if(context.type == context.UserEventType.CREATE){

 				var rpApprovalHistoryLog = context.newRecord;

				var rpo = record.load({
				 				type : 'customrecord_ts2_rlpo',
				 				id : rpApprovalHistoryLog.getValue('custrecord_ts2_rl_app_log_rl_po_no'),
				 				isDynamic : false
				 			});

 				var rpoObject = getRPO(rpo);

 				if(rpoObject == null){
 					log.debug('Release PO status', 'Release PO is not yet approved. Exiting...');
 					return;
 				}

 				var poList = getProducts(rpApprovalHistoryLog.getValue('custrecord_ts2_rl_app_log_rl_po_no'));

 				var fileObject = file.load({
 					id: 'SuiteScripts/One Pacific/src/templates/TS2_IRF_Word_Template1'
 				});

 				var word = fileObject.getContents();

 				var rowObject = file.load({
 					id : 216154
 				});

 				

 				var rows = '';

	            for(var i = 0; i < poList.length; i++){
	            	var row = rowObject.getContents();
	            	for(var key in poList[i]){
	            		log.debug('key', key);
	            		row = row.toString().replace('@{' + key + '}', poList[i][key]);
	            	}
	            	rows += row;
	            }
              
              

	            log.debug('Rows', rows);

	            for(var key in rpoObject){
	            	word = word.toString().replace('@{' + key + '}', rpoObject[key]);
	            }

	            if(rows != ''){
	            	word = word.toString().replace('@{products}', rows);   
	            } 


	            var fileName = rpo.getText('name');

				var revNo = rpApprovalHistoryLog.getValue('custrecord_ts2_rl_app_log_rev_no');
	            if(revNo != '' && revNo != 0){
	            	fileName += ' Revision ' + revNo;
	            }             

              
	            fileName = fileName +  '_IRF';

	            var headerFile = file.load({
	            	id : 'SuiteScripts/One Pacific/src/templates/TS2_IRF_header.htm'
	            });

	            log.debug('Header File Content', headerFile.url); 

				var domain = url.resolveDomain({
				    hostType: url.HostType.APPLICATION,
				    accountId: runtime.accountId
				});

				for(var i = 0; i < 6; i++){
	            	word = word.toString().replace('@{headerURL}', 'https://' + domain + headerFile.url);
				} 

             	var decoded = encode.convert({
				    string: word,
				    inputEncoding: encode.Encoding.UTF_8,
				    outputEncoding: encode.Encoding.BASE_64
				});
		              
	            var docFile = file.create({
	            	name : fileName + '.doc',
	            	contents : decoded,
	            	fileType : file.Type.WORD,
	            	folder : 60247
	            });
	            
              var d = docFile.save();
	            log.debug('file created', d);
	            
	            record.submitFields({
	            	type : 'customrecord_ts2_rl_app_history_log',
	            	id : rpApprovalHistoryLog.id,
	            	values :{
	            		custrecord_ts2_rl_app_log_irf : d
	            	}
	            });
        }




    }


    return {
    	afterSubmit : afterSubmit
    }



});
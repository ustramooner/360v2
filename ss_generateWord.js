/**
 *@NApiVersion 2.x
 *@NScriptType scheduledscript
 */

 define(['N/record', 'N/file', 'N/log', 'N/search'], 
    function(record, file, log, search){

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



        function execute(){

            var RPO = getRPO(1850);
            var poList = getProducts(1850).list;

            var fileObject = file.load({
                id: 216052,
                fileType : file.Type.PLAINTEXT
            });

            var rowObject = file.load({
                id : 216154
            });

            var word = fileObject.getContents();

            var rows = '';

            //log.debug('Word', word);
            log.debug('row', row);

            for(var i = 0; i < poList.length; i++){
                var row = rowObject.getContents();
                for(var key in poList[i]){
                    log.debug('key', key);
                    row = row.toString().replace('@{' + key + '}', poList[i][key]);
                }
                rows += row;
            }

            log.debug('Rows', rows);

            for(var key in RPO){

                word = word.toString().replace('@{' + key + '}', RPO[key]);
            }
            if(rows != ''){
                word = word.toString().replace('@{products}', rows);   
            } 
            var docFile = file.create({
                name : 'new9.doc',
                contents : word,
                fileType : file.Type.PLAINTEXT,
                folder : 58726
            });
            
            var d = docFile.save();
            log.debug('file created', d);

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
                    pono : pl.getValue('custrecord_ts2_rlpo_bpo_no'),
                    item : po.getValue('custbody_ts2_rspol_item'),
                    releaseno : pl.getValue('name'),
                    ohno : pl.getValue('custrecord_ts2_rlpo_customer_release_no'),
                    qty : po.getValue('custbody_ts2_rspol_qty')
                });    
                
            }
            log.debug('list',pos);

            return {
                list : pos
            }


        }

        function getRPO(id){
            var rpo = record.load({
                type : 'customrecord_ts2_rlpo',
                id : id,
                isDynamic : false
            });


            var factory = record.load({
                type : 'customrecord_fty_profile',
                id : rpo.getValue('custrecord_ts2_rlpo_fty')
            });

            var factory_cn = convertToEntities(factory.getText('custrecord_fty_name_cn'));
            var factory_address_cn = convertToEntities(factory.getText('custrecordfty_address_cn'));

            log.debug('Factory Details', 'factory name: ' + factory_cn + ' factory address: ' + factory_address_cn);

            var contact = getVendorContact(rpo.getValue('custrecord_ts2_rlpo_vendor_ctc'));
            log.debug('Contact', contact);
            var data = {
                supplier : rpo.getText('custrecord_ts2_rlpo_supplier'),
                vendor : rpo.getText('custrecord_ts2_rlpo_vendor_ctc'),
                mainphone : contact.phone,
                phone : contact.mobilephone,
                fax :  contact.fax,
                factory_cn : factory_cn,
                factory_address_cn : factory_address_cn,

            };

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


        function testss(rpoId){
            var result = search.load({
                id : 'customsearch_rpo_search',
                filter : [
                {
                    name : 'custbody_ts2_rspol_rlpo_no',
                    operator : search.Operator.IS,
                    values : rpoId
                }
                ]
            });
            var r = result.run().getRange({
                start : 0,
                end : 1000
            });

            log.debug('test', r);

            log.debug('Result', r.length);
            return r;
        }


        function getPuchaseOrder(rpoId){

            //testss(rpoId);
            //return testss(rpoId);
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

            log.debug('Result', resultSet.length);

            if(resultSet != null && resultSet.length > 0){
                return resultSet;
            }

            return null;

        }


        return {
            execute : execute
        }



    });
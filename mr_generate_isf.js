/**
 *@NApiVersion 2.x
 *@NScriptType MapReduceScript
 */
define(['N/search', 'N/record', 'N/log', '../src/lib/obj_asn_xml_gen'], function(search, record, log, asn_xml_gen) {

    function getInputData() {

        var result = search.load({
            id: 'customsearch_asn_for_isf_generation'
        });
        var resultSet = result.run().getRange(0, 1000);
        log.debug('Get Input Data Result', resultSet);
        if (resultSet.length > 0) {

            log.debug('ASN Count', resultSet.length);
            return resultSet;
        } else {
            log.debug('No ASN(Closed) found', '---->');
        }
    }

    function map(context) { //remove empty xml files
        log.debug('unparsed value', context.value);
        var result = JSON.parse(context.value);
        log.debug('ASN Result (map)', result);
        var xmlFile = result.values.custrecord_xml_file;
        log.debug('Checking XML', xmlFile.length);
        if (xmlFile != null && xmlFile.length > 0) {
            context.write(result, xmlFile[0].text);
        } else {
            log.debug('Skipping ASN. No 1st ISF XML File Created', result.id);
        }

    }


    function reduce(context) { // only process asn with 1st isf file available. 2nd isf will be ignored
        try {
            var asn = JSON.parse(context.key);
            log.debug('ASN ID', asn.id);
            log.debug('XML File', context.values);

            if (context.values[0].toString().indexOf('pre') > -1) {
                log.debug('context key', context.key);
                asn_xml_gen.execute(asn.id);
            } else {
                log.debug('2nd ISF is already available', context.values);
            }
        } catch (ex) {
            log.debug('Error on reduce', ex);
        }

    }

    function summarize(summary) {

        log.debug('done', '-------');

    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    }

});
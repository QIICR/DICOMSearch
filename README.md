DICOMSearch
===========

A utility to put the DICOM standard into a searchable database with web app

This uses python to parse a local copy of the DocBook xml version of the standard
(see DICOM Standard status page for the most up-to-date version:
http://www.dclunie.com/dicom-status/status.html).  

The paragraphs are converted into couchdb documents and pushed to the server.
Text search is enabled by Lucene index over paragraph text. As such, this
implementation, as is, is tied to the specific instance of Cloudant database.

A utility couchSite copies the local site directory as attachments to a document
called .site so that the site can be hosted directly from CouchDB.  The site
allows you to type a keyword and get instant results.

Dependencies (Parser)
=======

    pymongo - https://pypi.python.org/pypi/pymongo/
    
    couchdb - https://pypi.python.org/pypi/CouchDB
    
    peewee - https://pypi.python.org/pypi/peewee
    
    lxml - https://pypi.python.org/pypi/lxml/3.4.4


Dependencies (WebPage)
=======
    npm - https://nodejs.org/en/
    
    bower - http://bower.io/
    
    wan-select - https://github.com/che85/wan-select


Installation
=======

    1. Install npm and bower
    2. Run 'bower install' from site root directory
    3. Copy wan-select to subdirectory site/bower_components
    4. Run index.html


Caveats
=======

Some things that this doesn't support:

- searches for words less than 5 letters long

- boolean operations or wildcards

- figures, tables, and other items from the standard

- a DICOM data dictionary for quick lookup

- search in the titles of the DocBook links (tables, sections, etc.)

ACKNOWLEDGMENTS
===============

Development of this search index was supported in part by the Quantitative Image
Informatics in Cancer Research (QIICR) project (http://qiicr.org) through the
award U24 CA180918 from the National Cancer Institute.

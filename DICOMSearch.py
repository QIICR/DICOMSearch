#!/usr/bin/env python
"""
Create a CouchDB database with the contents of the DICOM Standard.

Add a view that maps all words to the section ids where they appear.

Use --help to see options.

This is a handy script for development. Paste it in a terminal window
(on a mac with fswatch installed) and it will reupload the site
and reload the browser tab each time you save a file.

fswatch . "echo -n reload... ; ./couchSite.py site http://localhost:5984 dicom_search; osascript ~/Downloads/fswatch/reloadChrome.applescript; echo \"done \"; date

TODO:
    Consider switching to elasticsearch or something similar
    https://github.com/elasticsearch/elasticsearch

    Maybe add DataTables for the output
    https://github.com/DataTables/DataTables



"""

import sys, os, traceback, re
import couchdb
from couchdb import http
import lxml.etree as ET
import argparse


# {{{ DICOMSearchParser

class DICOMSearchParser(object):
  """Parse xml files in the dicom standard and create the database.
  """

  NAME_MAP = {'para' : '{http://docbook.org/ns/docbook}para',
             'term' : '{http://docbook.org/ns/docbook}term',
             'chapter' : '{http://docbook.org/ns/docbook}chapter',
             'id' : '{http://www.w3.org/XML/1998/namespace}id'}

  def __init__(self, dicomStandardPath, **kwargs):
    self.dicomStandardPath = dicomStandardPath

    for key, value in kwargs.iteritems():
      setattr(self, key, value)

    self.dbConnection = None

    self.ids = []
    self.paragraphNumber = 0
    self.paragraphNumberMap = {}

  def setupDatabase(self):
    raise NotImplementedError

  def save(self, jsonDictionary):
    raise NotImplementedError

  def loadDesign(self):
    pass

  def parseToDatabase(self):
    """Look through dicomStandardPath for xml files
    and then parse each one"""
    for root, dirs, files in os.walk(self.dicomStandardPath):
      for fileName in files:
        fileNamePath = os.path.join(root, fileName)
        try:
          if fileNamePath.endswith('.xml'):
            print("Parsing %s" % fileNamePath)
            self.parseDocBook(fileNamePath)
        except Exception, e:
          print ("Couldn't parse xml from %s" % fileNamePath)
          print str(e)
          traceback.print_exc()
          continue

  def parseDocBook(self, docBookPath):
    """Make a document for each para tag in the xml citing
    which section they are in.  Then make a document with each
    word in the paragraph pointing to that paragraph document id.
    """
    etree = ET.parse(docBookPath)
    part = etree.getroot()
    self.ids = [os.path.splitext(os.path.split(docBookPath)[-1])[0]]

    path = []
    print 'we are starting'
    self.nChapters = 0
    self.parseElementParagraphs(part, path, 1, 0)

  def parseElementParagraphs(self, element, itemPath, termId, level):
    # reset paragraph counter to facilitate finding of the paragraph
    #  in HTML version within id'd element
    resetCounter = self.NAME_MAP['id'] in element.attrib
    printId = None
    if resetCounter:
      printId = element.attrib[self.NAME_MAP['id']]
    #print ' '*level,element.tag,'level=',level,'id=',printId

    if element.tag == self.NAME_MAP['para'] or element.tag == self.NAME_MAP['term']:
      thisText = ET.tostring(element,method="text",encoding="utf-8")
      # remove duplicate spaces
      thisText = re.sub("\s\s+"," ",thisText)
      # ignore (almost) empty paragraphs
      if len(thisText)>1:
        if element.tag == self.NAME_MAP['para']:
          try:
            thisId = ','.join(itemPath)+','+element.attrib[self.NAME_MAP['id']]
          except KeyError:
            return termId
        else:
          itemType = element.tag.split('}')[1]
          thisId = ','.join(itemPath)+','+itemType+'_%d' % termId
        jsonDictionary = {}
        jsonDictionary['_id'] = thisId
        jsonDictionary['text'] = unicode(thisText,'utf-8')
        jsonDictionary['xml_id'] = thisId.split(',')[-2]
        self.save(jsonDictionary)
      if element.tag == self.NAME_MAP['term']:
        termId += 1
    else:
      if resetCounter:
        resetTermId = 1
        elementId = self.NAME_MAP['id']
        itemPath.append(element.attrib[elementId])
      '''
      if element.tag == self.NAME_MAP['chapter']:
        self.nChapters = self.nChapters+1
        if self.nChapters>60:
          raise SystemExit
      '''
      for child in element:
        if resetCounter:
          resetTermId = self.parseElementParagraphs(child, itemPath, resetTermId, level+1)
        else:
          termId = self.parseElementParagraphs(child, itemPath, termId, level+1)
      if resetCounter:
        termId =+ resetTermId
        itemPath.pop()
    return termId

# }}}


class DICOMSearchParserCouchDB(DICOMSearchParser):

  def loadDesign(self):
    """Load the design documents for the search views
    http://127.0.0.1:5984/dicom_search/_design/search/_view/paraByWord?key=%22acted%22&include_docs=true&reduce=false
    """
    self.dbConnection['_design/search'] = {
      'language' : 'javascript',
      'views' : {
        'paraByWord' : {
          'map' : '''
            function(doc) {
              if (doc.word) {
                emit( doc.word, { "_id" : doc.paraID } );
              }
            }
          ''',
        'reduce' : '''_count()''',
        }
      },
      "indexes": {
        "textSearch": {
          "analyzer": "standard",
          "index": '''
            function(doc){
              index("default", doc.text,{
                "store":"yes"
              });
              index("location", doc._id, {
                "store":"yes"
              });
            }
          '''
        }
      }
    }

  def setupDatabase(self):
    # couchDB_URL='http://admin:admin@localhost:5984'
    couch = couchdb.Server("http://" + self.user + ":" + self.password + "@" + self.host + ":" + self.port)
    try:
      couch.delete(self.databaseName)
    except http.ResourceNotFound:
      pass
    self.dbConnection = couch.create(self.databaseName)

  def save(self, jsonDictionary):
    try:
      self.dbConnection.save(jsonDictionary)
    except http.ResourceConflict:
      e = sys.exc_info()[0]
      print 'Failed to save: ', e
      print jsonDictionary
      sys.exit(0)


class DICOMSearchParserMongoDB(DICOMSearchParser):

  def setupDatabase(self):
    from pymongo import MongoClient
    mongoClient = MongoClient()
    try:
      mongoClient.drop_database(self.databaseName)
    except:
      pass
    self.dbConnection = mongoClient[self.databaseName]
    self.documents =  self.dbConnection.documents

  def save(self, jsonDictionary):
    print self.documents.insert_one(jsonDictionary).inserted_id


class DICOMSearchParserMySQL(DICOMSearchParser):

  def setupDatabase(self):
    # TODO: done in Document. should be more flexible -- now hardcoded
    # db = peewee.MySQLDatabase("dicom", user="root", unix_socket="/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock")
    pass

  def save(self, jsonDictionary):
    from document import Document
    doc = Document(documentID=jsonDictionary['_id'], text=jsonDictionary['text'])
    doc.save()


# {{{ main, test, and arg parse

def main(argv):
  try:
    parser = argparse.ArgumentParser(description="DICOM Standard XML Parser")

    parser.add_argument("-i", "--DICOM-Standard", dest="input_folder", metavar="PATH", default="-", required=True,
                        help="Folder of input DICOM XML Standard (can contain sub-folders)")

    parser.add_argument("-db", "--database-type", choices=["couch","mongo", "mysql"], dest="dbType", default="couch",
                        help="Choose between CouchDB, MongoDB or MySQL database")

    parser.add_argument("-host", "--host", dest="host", type=str, default="localhost")
    parser.add_argument("-p", "--port", dest="port", type=str, default="5984")
    parser.add_argument("-l", "--login", dest="user", type=str, default="admin")
    parser.add_argument("-pw", "--password", dest="password", type=str, default="admin")
    parser.add_argument("-n", "--database-name", dest="databaseName", type=str, default="dicom_standard_2015c")
    args = parser.parse_args(argv)

    if args.input_folder == "-":
      print('Please specify input DICOM XML Standard folder!')
    else:
      if not os.path.exists(args.input_folder):
        print "Invalid path: %s" % args.input_folder
        sys.exit()

    parserClass = None

    if args.dbType == "couch":
      parserClass = DICOMSearchParserCouchDB
    elif args.dbType == "mongo":
      parserClass = DICOMSearchParserMongoDB
    elif args.dbType == "mysql":
      parserClass = DICOMSearchParserMySQL

    parser = parserClass(args.input_folder, databaseName=args.databaseName, host=args.host,
                         port=args.port, user=args.user, password=args.password)

    parser.setupDatabase()
    parser.loadDesign()
    parser.parseToDatabase()

  except Exception, e:
    print e
  sys.exit()

if __name__ == "__main__":
  main(sys.argv[1:])

# }}}

# vim:set sr et ts=4 sw=4 ft=python fenc=utf-8: // See Vim, :help 'modeline
# vim: foldmethod=marker




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


# {{{ DICOMSearchParser
class DICOMSearchParser:
  """Parse xml files in the dicom standard and create the database.
  """

  def __init__(self, dicomStandardPath, couchDB_URL='http://localhost:5984', databaseName='DICOMSearch'):
    self.dicomStandardPath = dicomStandardPath
    self.couchDB_URL = couchDB_URL
    self.databaseName = databaseName

    self.ids = []
    self.paragraphNumber = 0
    self.paragraphNumberMap = {}

    self.nameMap = {
            'para' : '{http://docbook.org/ns/docbook}para',
            'term' : '{http://docbook.org/ns/docbook}term',
            'chapter' : '{http://docbook.org/ns/docbook}chapter',
            'id' : '{http://www.w3.org/XML/1998/namespace}id',
            }

    self.couch = None
    self.db = None

  def setupDatabase(self):
    self.couch = couchdb.Server(self.couchDB_URL)
    try:
      self.couch.delete(self.databaseName)
    except http.ResourceNotFound:
      pass
    self.db = self.couch.create(self.databaseName)

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

  def save(self, jsonDictionary):
    try:
      self.db.save(jsonDictionary)
    except http.ResourceConflict:
      e = sys.exc_info()[0]
      print 'Failed to save: ',e
      print jsonDictionary
      sys.exit(0)

  def loadDesign(self):
    """Load the design documents for the search views
    http://127.0.0.1:5984/dicom_search/_design/search/_view/paraByWord?key=%22acted%22&include_docs=true&reduce=false
    """
    self.db['_design/search'] = {
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

    ##self.parseElement(part)

  def parseElementParagraphs(self, element, itemPath, termId, level):
    # reset paragraph counter to facilitate finding of the paragraph
    #  in HTML version within id'd element
    resetCounter = self.nameMap['id'] in element.attrib
    printId = None
    if resetCounter:
      printId = element.attrib[self.nameMap['id']]
    #print ' '*level,element.tag,'level=',level,'id=',printId

    if element.tag == self.nameMap['para'] or element.tag == self.nameMap['term']:
      thisText = ET.tostring(element,method="text",encoding="utf-8")
      # remove duplicate spaces
      thisText = re.sub("\s\s+"," ",thisText)
      # ignore (almost) empty paragraphs
      if len(thisText)>1:
        if element.tag == self.nameMap['para']:
          thisId = ','.join(itemPath)+','+element.attrib[self.nameMap['id']]
        else:
          itemType = element.tag.split('}')[1]
          thisId = ','.join(itemPath)+','+itemType+'_%d' % termId
        jsonDictionary = {}
        jsonDictionary['_id'] = thisId
        jsonDictionary['text'] = unicode(thisText,'utf-8')
        jsonDictionary['xml_id'] = thisId.split(',')[-2]
        self.save(jsonDictionary)
        #self.SendToDB(paraId, paraText)
      if element.tag == self.nameMap['term']:
        termId += 1
      #print ' '*level,'Added ID:',thisId
      #print ' '*level,'Added text:',thisText
      #print ' '*level,'New counters:',itemIds
      # bump the counter even for empty paragraphs, since this will be needed
      #  for locating them later
    else:
      if resetCounter:
        resetTermId = 1
        elementId = self.nameMap['id']
        itemPath.append(element.attrib[elementId])
      '''
      if element.tag == self.nameMap['chapter']:
        self.nChapters = self.nChapters+1
        if self.nChapters>60:
          raise SystemExit
      '''
      for child in element:
        #print ' parsing child, path: ',itemPath,' id: ',itemIds,' level: ',level
        if resetCounter:
          resetTermId = self.parseElementParagraphs(child, itemPath, resetTermId, level+1)
        else:
          termId = self.parseElementParagraphs(child, itemPath, termId, level+1)
      if resetCounter:
        termId =+ resetTermId
        itemPath.pop()

    #print ' '*level,'/'+element.tag,'level=',level,'id=',printId
    return termId

  def parseElement(self, element):
    if element.tag == "{http://docbook.org/ns/docbook}para":
      paraText = ET.tostring(element,method="text",encoding="utf-8")
      #print self.paragraphNumber
      #print paraText

      # remove duplicate spaces
      paraText = re.sub("\s\s+"," ",paraText)
      #paraText = paraText.replace('\n','')

      # Problem: if there is an id'd element inside id'd, it will reset the
      # counter of paragraphs, and
      # Solution: keep the map of mapping from id (everything except para) to
      #   the paragraph number
      paraLocation = ','.join(self.ids)
      paragraphNumber = 1
      if paraLocation in self.paragraphNumberMap.keys():
        paragraphNumber = self.paragraphNumberMap[paraLocation]
        self.paragraphNumberMap[paraLocation] += 1
      else:
        self.paragraphNumberMap[paraLocation] = paragraphNumber+1

      if len(paraText)>1:
        jsonDictionary = {}
        paraID= paraLocation + ',para_%d' % paragraphNumber
        jsonDictionary['_id'] = paraID
        jsonDictionary['text'] = unicode(paraText,'utf8')
        jsonDictionary['xml_id'] = paraID.split(',')[-2]
        ###self.paragraphNumber += 1
        #print paraID
        #print paraText
        self.save(jsonDictionary)

        if 0:
          words = set(map(str.lower, map(str,paraText.split())))
          for word in words:
            if len(word) > 4:
              #print 'Word is ',word
              jsonDictionary = {}
              jsonDictionary['_id'] = unicode(paraID,'utf8') + "," + unicode(word,'utf8')
              jsonDictionary['paraID'] = unicode(paraID,'utf8')
              jsonDictionary['word'] = unicode(word,'utf8')
              jsonDictionary['xml_id'] = paraID.split(',')[-2]
              self.save(jsonDictionary)
    # paragraphs can have id's, do not reset if this is the case
    elif self.nameMap['id'] in element.attrib:
      self.ids.append(element.attrib[self.nameMap['id']])
      self.paragraphNumber = 1


# }}}

# {{{ main, test, and arg parse

def usage():
  print ("DICOMSearch [DICOMStandard] <CouchDB_URL> <DatabaseName>")
  print (" CouchDB_URL default http://localhost:5984")
  print (" DatabaseName default DICOMSearch")

def main():
  dicomStandardPath = sys.argv[1]
  parser = DICOMSearchParser(dicomStandardPath)
  if len(sys.argv) > 2:
    parser.couchDB_URL = sys.argv[2]
  if len(sys.argv) > 3:
    parser.databaseName = sys.argv[3]

  parser.setupDatabase()
  parser.loadDesign()
  parser.parseToDatabase()

forIPython = """
import sys
sys.argv = ('test', '/Users/fedorov/github/DICOMStandard')
"""

if __name__ == '__main__':
  try:
    if len(sys.argv) < 2:
      raise BaseException('missing arguments')
    main()
  except Exception, e:
    print ('ERROR, UNEXPECTED EXCEPTION')
    print str(e)
    traceback.print_exc()

# }}}

# vim:set sr et ts=4 sw=4 ft=python fenc=utf-8: // See Vim, :help 'modeline
# vim: foldmethod=marker

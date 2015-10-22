import peewee


db = peewee.MySQLDatabase("dicom_standard_2015c", user="root", unix_socket="/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock")


class Document(peewee.Model):

  documentID = peewee.CharField()
  text = peewee.TextField()

  class Meta:
    database = db
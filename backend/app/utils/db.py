import mysql.connector
from mysql.connector import Error
from flask import current_app


class Database:
    """Database connection manager for MySQL"""
    
    _connection = None
    
    @staticmethod
    def get_connection():
        """Get or create database connection"""
        if Database._connection is None or not Database._connection.is_connected():
            try:
                config = {
                    'host': current_app.config['DB_HOST'],
                    'user': current_app.config['DB_USER'],
                    'password': current_app.config['DB_PASSWORD'],
                    'database': current_app.config['DB_NAME'],
                    'autocommit': True
                }
                Database._connection = mysql.connector.connect(**config)
                print("Connected to MySQL database successfully")
            except Error as e:
                print(f"Error while connecting to MySQL: {e}")
                raise
        
        return Database._connection
    
    @staticmethod
    def close_connection():
        """Close database connection"""
        if Database._connection is not None and Database._connection.is_connected():
            Database._connection.close()
            Database._connection = None
            print("MySQL connection closed")
    
    @staticmethod
    def execute_query(sql, params=None, fetch_one=False):
        """Execute a SELECT query and return results"""
        connection = Database.get_connection()
        cursor = connection.cursor(dictionary=True)
        
        try:
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)
            
            if fetch_one:
                result = cursor.fetchone()
            else:
                result = cursor.fetchall()
            
            return result
        except Error as e:
            print(f"Error executing query: {e}")
            raise
        finally:
            cursor.close()
    
    @staticmethod
    def execute_update(sql, params=None):
        """Execute INSERT, UPDATE, or DELETE query"""
        connection = Database.get_connection()
        cursor = connection.cursor()
        
        try:
            if params:
                cursor.execute(sql, params)
            else:
                cursor.execute(sql)
            
            connection.commit()
            return cursor.lastrowid if cursor.lastrowid else True
        except Error as e:
            connection.rollback()
            print(f"Error executing update: {e}")
            raise
        finally:
            cursor.close()

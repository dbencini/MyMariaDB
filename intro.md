*Tech Stack:
    Electron application for windows 11
    node.js
    sqlite3

App purpose:
    This app will be similar to microsoft SSMS
    It will connect to mysql or mariadb or mssql databases only
    It will allow you to run queries
    It will display the results in a table
    It will have a sidebar to navigate between databases and tables
    It will have a top bar to select the database and table
    It will have a main content area to display the query results
    It will have a bottom bar to display the query status
    The app will be open source and free
    
The ultimate goal:
    Is to be able to see data, backup and restore databases.
    But i want it to specialise in backing up mysql databases version 8.0.42 in a compatible way for a MariaDB version 11.8.6-ubu2404 restore or a mysql version 8.0.42 restore.
    and verifying that the data has restored correctly by comparing row counts from each table as i dont want the verify process to take too long.
    The backup will have the option to backup to a zip file or just the sql file or both

General Architecture:
    The app will have a main process and a renderer process
    The renderer process will be responsible for the UI
    The main process will be responsible for the database connections   
    The main process will use sqlite3 to store the database connections

To create the proper .exe installer:
    1. Enable Developer Mode in Windows Settings → System → For developers
    2. Delete the bad cache: rmdir /s /q "C:\Users\dbenc\AppData\Local\electron-builder\Cache\winCodeSign"
    3. Run: npm run dist

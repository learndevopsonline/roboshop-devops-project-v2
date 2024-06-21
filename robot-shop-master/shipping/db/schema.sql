create database if not exists cities;

-- Replace 'newuser' with the desired username
-- Replace 'password' with the desired password
-- Replace 'localhost' with the desired host, if necessary
use cities;

DROP TABLE IF EXISTS `cities`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cities` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `country_code` varchar(2) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `name` varchar(100) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `region_idx` (`region`),
  KEY `c_code_idx` (`country_code`),
  FULLTEXT KEY `city_idx` (`city`)
) ENGINE=InnoDB AUTO_INCREMENT=6223666 DEFAULT CHARSET=latin1;
/*!40101 SET character_set_client = @saved_cs_client */;

DELIMITER $$

-- Create a stored procedure to handle the user creation if not exists
CREATE PROCEDURE CreateUserIfNotExists()
BEGIN
    DECLARE userExists INT DEFAULT 0;

    -- Check if the user exists
    SELECT COUNT(*) INTO userExists
    FROM mysql.user
    WHERE user = 'shipping' AND host = 'localhost';

    -- Create the user if it does not exist
    IF userExists = 0 THEN
        CREATE USER 'shipping'@'localhost' IDENTIFIED BY 'RoboShop@1';
        GRANT ALL PRIVILEGES ON *.* TO 'shipping'@'localhost' WITH GRANT OPTION;
        FLUSH PRIVILEGES;
    END IF;
END$$

DELIMITER ;

-- Call the procedure
CALL CreateUserIfNotExists();

-- Drop the procedure
DROP PROCEDURE IF EXISTS CreateUserIfNotExists;



MPWD=$(pwd)


: <<EOF
dnf module disable nginx -y
dnf module enable nginx:1.24 -y

dnf install nginx -y
rm -rf /usr/share/nginx/html/*
cp -r web/static/*  /usr/share/nginx/html/
cp web/nginx.conf /etc/nginx/nginx.conf
systemctl enable nginx
systemctl restart nginx

#
cd $MPWD
cp mongo.repo /etc/yum.repos.d/mongo.repo
dnf install -y mongodb-org
sed -i -e 's/127.0.0.1/0.0.0.0/' /etc/mongod.conf
systemctl enable mongod
systemctl restart mongod

dnf module disable redis -y
dnf module enable redis:7 -y
dnf install redis -y
sed -i -e 's/127.0.0.1/0.0.0.0/' /etc/redis/redis.conf
systemctl enable redis
systemctl restart redis

cd $MPWD
cp catalogue.service /etc/systemd/system/catalogue.service
cp user.service /etc/systemd/system/user.service
cp cart.service /etc/systemd/system/cart.service

dnf module disable nodejs -y
dnf module enable nodejs:20 -y
dnf install nodejs -y
rm -rf /catalogue
cp -r catalogue /
cd /catalogue
npm install
mongosh < /catalogue/db/master-data.js
systemctl daemon-reload
systemctl enable catalogue
systemctl start catalogue

cd $MPWD
rm -rf /user
cp -r user /
cd /user
npm install
systemctl daemon-reload
systemctl enable user
systemctl restart user

cd $MPWD
rm -rf /cart
cp -r cart /
cd /cart
npm install
systemctl daemon-reload
systemctl enable cart
systemctl restart cart


dnf install mysql-server -y
systemctl enable mysqld
systemctl start mysqld
mysql_secure_installation --set-root-pass RoboShop@1


cd $MPWD
rm -rf /shipping
cp -r shipping /
cp shipping.service /etc/systemd/system/shipping.service
# dnf install java-21-openjdk-devel -y
dnf install maven -y

cd /shipping
mvn clean package
cp -r target/shipping*.jar shipping.jar
mysql -uroot -pRoboShop@1 <db/schema.sql
mysql -uroot -pRoboShop@1 <db/master-data.sql
systemctl daemon-reload
systemctl enable shipping
systemctl restart shipping





cp rabbitmq.repo /etc/yum.repos.d/rabbitmq.repo
dnf install rabbitmq-server -y
EOF

cd $MPWD
rm -rf /payment
cp -r payment /
cp payment.service /etc/systemd/system/payment.service
dnf install python36 gcc python3-devel -y
cd /payment
pip3.6 install -r requirements.txt


MPWD=$(pwd)
dnf module disable nginx -y
dnf module enable nginx:1.24 -y

dnf install nginx -y
rm -rf /usr/share/nginx/html/*
cp -r web/static/*  /usr/share/nginx/html/
cp web/nginx.conf /etc/nginx/nginx.conf
systemctl enable nginx
systemctl start nginx

#
cd $PWD
cp mongo.repo /etc/yum.repos.d/mongo.repo
dnf install -y mongodb-org
systemtl enable mongod
systemctl start mongod


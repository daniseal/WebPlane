FROM nginx:stable-alpine

COPY *.html *.css README.md /usr/share/nginx/html/
COPY WebPlanes.html /usr/share/nginx/html/index.html
COPY img/ /usr/share/nginx/html/img/
COPY js/ /usr/share/nginx/html/js/
COPY vendor/ /usr/share/nginx/html/vendor/
COPY docs/ /usr/share/nginx/html/docs/

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -q -O /dev/null http://127.0.0.1/WebPlanes.html || exit 1

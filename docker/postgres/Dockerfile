FROM postgres:17-alpine

# Tini supervises crond + postgres so signals propagate and zombies are reaped.
# barman-cloud-* are installed into a venv to avoid touching the system python.
RUN apk add --no-cache \
        python3 \
        py3-virtualenv \
        bash \
        tini \
        ca-certificates \
        su-exec \
    && python3 -m venv /opt/barman \
    && /opt/barman/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/barman/bin/pip install --no-cache-dir 'barman[cloud]'

ENV PATH="/opt/barman/bin:${PATH}"

COPY entrypoint-wrapper.sh /usr/local/bin/entrypoint-wrapper.sh
COPY barman-backup.sh      /usr/local/bin/barman-backup.sh

RUN chmod 0755 /usr/local/bin/entrypoint-wrapper.sh /usr/local/bin/barman-backup.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint-wrapper.sh"]
CMD ["postgres"]

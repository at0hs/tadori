# backup のイメージ（D-19）。db と同じメジャーバージョンの PostgreSQL に、スクリプトを足す。
FROM postgres:18
COPY lib.sh /opt/tadori/lib.sh
COPY test /opt/tadori/test
COPY bin/ /usr/local/bin/
RUN chmod 0755 /usr/local/bin/tadori-*
ENV TZ=Asia/Tokyo \
  PGHOST=db \
  PGUSER=tadori \
  PGDATABASE=tadori
ENTRYPOINT ["tadori-scheduler"]

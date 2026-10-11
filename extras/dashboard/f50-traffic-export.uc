import * as fs from 'fs';
let source=ARGV[0], root=ARGV[1] || '/opt/f50-traffic-hours';
if (root != '/opt/f50-traffic-hours' && !match(root, /^\/tmp\/f50-traffic-test-[a-zA-Z0-9-]+$/)) die('Invalid archive root');
let data=json(fs.readfile(source));
let rows=data?.interfaces?.[0]?.traffic?.hour;
if (type(rows) != 'array') die('Invalid hourly dataset');
fs.mkdir(root,0700);
let days={};
for (let row in rows) {
 let d=row.date, h=row.time?.hour;
 if (!d || h < 0 || h > 23 || row.rx < 0 || row.tx < 0) continue;
 let day=sprintf('%04d-%02d-%02d',d.year,d.month,d.day);
 if (!match(day,/^\d{4}-\d{2}-\d{2}$/)) continue;
 days[day] ||= {};
 days[day][sprintf('%02d',h)]=row;
}
for (let day, hours in days) {
 let body='date,hour_beijing,received_bytes,sent_bytes,total_bytes\n';
 for(let h=0;h<24;h++) {
  let row=hours[sprintf('%02d',h)];
  if(row) body+=sprintf('%s,%02d:00-%02d:00,%.0f,%.0f,%.0f\n',day,h,h+1,row.rx,row.tx,row.rx+row.tx);
 }
 let path=root+'/'+day+'.csv';
 if (fs.readfile(path)!=body) {
  if(!fs.writefile(path+'.new',body)) die('CSV write failed');
  fs.chmod(path+'.new',0600); if(!fs.rename(path+'.new',path)) die('CSV rename failed');
 }
}
if(!fs.writefile(root+'/hourly.json.new',sprintf('%J',data))) die('JSON write failed');
fs.chmod(root+'/hourly.json.new',0600);
if(!fs.rename(root+'/hourly.json.new',root+'/hourly.json')) die('JSON rename failed');
// Delete only matching date CSVs, after valid data was successfully archived.
let cut=localtime(time()-99*86400), cutoff=sprintf('%04d-%02d-%02d',cut.year,cut.mon,cut.mday);
for(let name in fs.lsdir(root) || []) {
 if(time()>=1735689600 && match(name,/^\d{4}-\d{2}-\d{2}\.csv$/) && substr(name,0,10)<cutoff) fs.unlink(root+'/'+name);
}
print('Hourly CSV archive updated\n');

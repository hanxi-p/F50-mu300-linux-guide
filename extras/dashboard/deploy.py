"""Transfer the optional dashboard via the user's existing SSH config; no passwords stored."""
import argparse
import io
from pathlib import Path
import subprocess
import tarfile

parser = argparse.ArgumentParser()
parser.add_argument('--host', default='f50', help='Existing SSH Host alias or root@management-address')
args = parser.parse_args()
if args.host.startswith('-'):
    parser.error('Host must not start with a dash')
source = Path(__file__).resolve().parent
stream = io.BytesIO()
with tarfile.open(fileobj=stream, mode='w:gz') as archive:
    for entry in sorted(source.iterdir()):
        if entry.is_file():
            archive.add(entry, arcname='dashboard/' + entry.name)
subprocess.run(['ssh', args.host, 'cat > /tmp/f50-dashboard.tar.gz'], input=stream.getvalue(), check=True)
subprocess.run(['ssh', args.host, 'mkdir -p /tmp/f50-dashboard-package && tar -xzf /tmp/f50-dashboard.tar.gz -C /tmp/f50-dashboard-package && sh /tmp/f50-dashboard-package/dashboard/install.sh'], check=True)

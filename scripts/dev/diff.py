import sys
from PIL import Image, ImageChops
a = Image.open(sys.argv[1]).convert('RGB'); b = Image.open(sys.argv[2]).convert('RGB').resize(a.size)
d = ImageChops.difference(a, b).convert('L')
px = list(d.getdata()); n = len(px)
print('size', a.size, 'mean diff %.2f' % (sum(px)/n), 'pixels >40: %.2f%%' % (100*sum(1 for v in px if v > 40)/n))
d.point(lambda v: 255 if v > 40 else 0).save(sys.argv[3])

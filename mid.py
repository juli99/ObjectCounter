
from turtle import done

from PIL import Image
# make a side-by-side comparison for binarization
imgs = ['real_original.png','bin_if.png','bin_cv2.png']
ims = [Image.open(i).convert('L') for i in imgs]
w,h = ims[0].size
combo = Image.new('L', (w*3+20, h), 255)
for i,im in enumerate(ims):
    combo.paste(im, (i*(w+10), 0))
combo.save('combo_binarize.png')

imgs2 = ['real_original.png','real_smooth_my.png','real_sharp_my.png']
ims2 = [Image.open(i).convert('L') for i in imgs2]
combo2 = Image.new('L', (w*3+20, h), 255)
for i,im in enumerate(ims2):
    combo2.paste(im, (i*(w+10), 0))
combo2.save('combo_filter.png')

imgs3 = ['synthetic_original.png','synthetic_smooth_my.png','synthetic_sharp_my.png']
ims3 = [Image.open(i).convert('L') for i in imgs3]
sw,sh = ims3[0].size
combo3 = Image.new('L', (sw*3+20, sh), 255)
for i,im in enumerate(ims3):
    combo3.paste(im, (i*(sw+10), 0))
combo3.save('combo_synth.png')
print('done')


done


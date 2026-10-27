import fitz,json,hashlib,collections
from pathlib import Path
src=Path('/workspace/scratch/d18db461804d/apartment_inputs/201 a 701 (3)(5).pdf')
p=fitz.open(src)[0]; m=p.rotation_matrix
roi=fitz.Rect(220,185,1145,585)
layers={'MUROS','p-revoque','Carpinterias PUERTAS','CARPINTERIAS','p-puerta'}
paths=[]
def xy(v):
 q=v*m; return [round(q.x,4),round(q.y,4)]
for index,d in enumerate(p.get_drawings()):
 if d.get('layer') not in layers: continue
 items=[]
 for i in d['items']:
  if i[0] in ('l','c'):
   pts=[xy(v) for v in i[1:]]
  elif i[0]=='re':
   r=i[1]; pts=[xy(v) for v in (r.tl,r.tr,r.br,r.bl)]
  elif i[0]=='qu':
   q=i[1];pts=[xy(v) for v in (q.ul,q.ur,q.lr,q.ll)]
  else:continue
  if all(roi.contains(fitz.Point(*v)) for v in pts):items.append({'kind':i[0],'points':pts})
 if items:paths.append({'source_path_index':index,'layer':d.get('layer'),'items':items,'closePath':d.get('closePath'), 'type':d.get('type')})
spans=[{'name':'suite','jambs':[[[563.20,318.24],[570.04,318.24]],[[563.20,367.92],[570.04,367.92]]]}, {'name':'bedroom','jambs':[[[626.44,318.24],[633.28,318.24]],[[626.44,367.92],[633.28,367.92]]]}, {'name':'main_bath','jambs':[[[801.88,367.92],[801.88,374.76]],[[851.56,367.92],[851.56,374.76]]]}, {'name':'dressing','jambs':[[[506.44,230.16],[512.68,230.16]],[[506.44,285.60],[512.68,285.60]]]}, {'name':'ensuite','jambs':[[[579.88,235.92],[586.72,235.92]],[[579.88,285.60],[586.72,285.60]]]}]
out={'source_path':str(src),'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'page_index':0,'extractor':'PyMuPDF Page.get_drawings (interpreted PDF graphics state, not lightweight stream parser)','source_path_count':len(p.get_drawings()),'coordinate_frame':{'units':'PDF points','origin':'top-left of rotated landscape page','page_size':[1191,842],'rotation_degrees':p.rotation,'raw_to_landscape_matrix':list(m),'formula':'landscape_x=raw_y; landscape_y=842-raw_x','landscape_to_360dpi':'multiply x,y by 5','main_plan_roi':list(roi)},'limitations':['Reference CAD drawing, not verified as-built.','ROI-filtered vector evidence, not room segmentation or a proposed model.','Segments crossing ROI omitted; labels and fixtures intentionally excluded.','Layer names are source labels, not sufficient semantic classification: visually validate each extracted path.','Printed dimension fit is not survey precision.'],'reviewed_door_jambs':spans,'extracted_layer_counts':dict(collections.Counter(d['layer'] for d in paths)),'paths':paths}
f=Path('/workspace/scratch/d18db461804d/apartment_qa_vector/source_vector_reference.json');f.write_text(json.dumps(out,indent=2));print(f);print(out['extracted_layer_counts']);print('bytes',f.stat().st_size)

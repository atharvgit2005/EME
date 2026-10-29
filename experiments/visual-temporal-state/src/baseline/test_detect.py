import cv2
import numpy as np

def find_entity(frame):
    r = frame[:, :, 2].astype(float)
    g = frame[:, :, 1].astype(float)
    b = frame[:, :, 0].astype(float)
    # Warm / red saliency: r - (g + b)/2
    saliency = r - (g + b) * 0.5
    mask = (saliency > 30).astype('uint8') * 255
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    valid = []
    for c in cnts:
        area = cv2.contourArea(c)
        if area > 1000:
            x, y, w, h = cv2.boundingRect(c)
            valid.append((x - 4, y - 4, w + 8, h + 8))
    return valid

for fix in ['a', 'b', 'c', 'd', 'e', 'f', 'g']:
    cap = cv2.VideoCapture(f'fixtures/fixture_{fix}.mp4')
    ret, frame = cap.read()
    cap.release()
    if ret:
        boxes = find_entity(frame)
        print(f"Fixture {fix}: {len(boxes)} boxes -> {boxes}")
    else:
        print(f"Fixture {fix}: error reading")

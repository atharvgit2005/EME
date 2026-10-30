/** Backend-specific contracts; canonical operation support is a separate engine concern. */
const BACKENDS=Object.freeze({
 verifiedNative:{version:'eme-native-canonical/3.2',sourceFit:'explicit compatible crop required when source aspect differs from canvas',container:'mp4',effects:['invert','brightness','contrast','blur','optical_fisheye_distortion','curved_typography'],effectParameters:{brightness:['factor'],contrast:['factor'],blur:['radius'],optical_fisheye_distortion:['cx','cy','k1','k2','interpolation']},animation:{properties:['transform.opacity','transform.x','transform.y'],easings:['linear']},curves:['arc'],curveAnimations:['none','fade_in_out','curve_reveal','curve_sweep','fade_and_sweep'],faceSafe:'typography only; requires complete per-source frame annotations and raster bounds; optical composition and position animation combinations fail closed',subjectSafe:'static title over one untransformed cropped video; complete observed scene intervals, bound source/font/preview, opaque backing and export geometry checks',colorGrade:false},
 hyperframes:{verifiedDelivery:false,nativeOptical:false,nativeCurvedTypography:false,nativeReframing:false},
 compositionDemo:{verifiedDelivery:false,frameRate:30,curves:['arc']}
});
module.exports={BACKENDS};
